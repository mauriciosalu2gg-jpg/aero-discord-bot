// core/moderationEngine.js
// Moderacion automatica por servidor. Cuando esta activo (/moderation
// activate), el bot vigila TODOS los mensajes del canal (no solo cuando le
// hablan) y sanciona a quien falte al respeto de forma repetida, con
// escalada:
//   1ra vez  -> Aviso (advertencia publica, sin sancion real)
//   2da vez  -> Timeout corto (10 min)
//   3ra vez  -> Timeout largo (1 hora)
//   4ta vez  -> Kick
//   5ta vez  -> Ban
//
// Sensibilidad "balanceada": no salta al primer insulto leve/broma entre
// amigos, pero tampoco espera a que sea grave.
//
// El estado de moderacion activa/inactiva por servidor, y el contador de
// faltas por (guildId, userId), se guardan en Firestore para sobrevivir
// reinicios en Render (el filesystem local es efimero ahi). Se cachea en
// memoria de proceso para no pegarle a Firestore en cada mensaje.

import { db } from '../database/firebase.js';

// guildId -> boolean (cache en memoria, se hidrata de Firestore al leer)
const activeGuildsCache = new Map();
// `${guildId}:${userId}` -> { strikes, lastStrikeAt } (cache en memoria)
const strikesCache = new Map();

const STRIKE_RESET_MS = 24 * 60 * 60 * 1000; // 24h: una falta vieja ya no escala

function strikeKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function isModerationActive(guildId) {
  // Lectura sincronica desde cache (se hidrata via setModerationActive o
  // hydrateModerationFlag al arrancar). Si nunca se cargo, asumimos false
  // (mas seguro que sancionar sin querer).
  return !!activeGuildsCache.get(guildId);
}

export async function setModerationActive(guildId, active) {
  activeGuildsCache.set(guildId, active);
  if (!db) return;
  try {
    await db.collection('guilds').doc(guildId).collection('stats').doc('moderation').set({
      active,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.error('[moderation/Firestore setActive]', err.message);
  }
}

// Se llama una vez al arrancar el bot (client 'ready') para precargar en
// memoria que servidores tenian moderacion activa antes del ultimo reinicio.
export async function hydrateModerationFlags() {
  if (!db) return;
  try {
    const guildsSnap = await db.collection('guilds').get();
    for (const guildDoc of guildsSnap.docs) {
      const modDoc = await guildDoc.ref.collection('stats').doc('moderation').get();
      if (modDoc.exists) activeGuildsCache.set(guildDoc.id, !!modDoc.data().active);
    }
    console.log(`[moderation] Flags de moderacion precargados para ${guildsSnap.size} servidor(es).`);
  } catch (err) {
    console.error('[moderation/Firestore hydrate]', err.message);
  }
}

// Patrones de falta de respeto para el modo moderacion. En vez de exigir
// frases armadas exactas (lo cual dejaba pasar insultos sueltos comunes
// como "boludo", "pendejo", "idiota" dichos solos, sin la oracion completa
// tipo "sos un idiota"), ahora se arma con:
//  1) Una lista de insultos/palabras base (incluye variantes comunes de
//     escritura: con/sin acentos, con *, con espacios raros tipo p.u.t.o).
//  2) Un chequeo de si el insulto va DIRIGIDO a alguien (hay una mencion
//     @user en el mismo mensaje, o el mensaje es respuesta directa a otro
//     mensaje, o el insulto esta en 2da persona "sos/eres un ...").
// Esto detecta tanto "@fulano sos un boludo" como un insulto suelto
// "pendejo de mierda" tirado en respuesta directa a alguien.
const INSULT_WORDS = [
  'boludo', 'boluda', 'pendejo', 'pendeja', 'idiota', 'imbecil', 'imb[eé]cil',
  'estupido', 'est[uú]pido', 'estupida', 'est[uú]pida', 'inutil', 'in[uú]til',
  'basura', 'mierda', 'sorete', 'gil', 'gilipollas', 'subnormal', 'retrasado',
  'retrasada', 'payaso', 'payasa', 'rata', 'lacra', 'asqueroso', 'asquerosa',
  'puto', 'puta', 'put[o0][o0]?', 'maric[oó]n', 'marica', 'hdp', 'hijo\\s*de\\s*puta',
  'hija\\s*de\\s*puta', 'malparido', 'malparida', 'desgraciado', 'desgraciada',
  'in[uú]til', 'anormal', 'trolo', 'ching[aá]', 'pelotudo', 'pelotuda',
  'forro', 'forra', 'nefasto', 'nefasta', 'basurero',
];

// arma un regex por palabra que tolera separadores raros entre letras
// (p.u.t.o, p u t o, p-u-t-o) para esquivar el intento clasico de evadir
// filtros. Solo se aplica esta tolerancia a palabras de 5+ letras: en
// palabras cortas (gil, puta, etc) volveria el regex demasiado laxo y
// empezaria a matchear adentro de palabras normales sin relacion.
function buildInsultRegex() {
  const alternatives = INSULT_WORDS.map(w => {
    // si ya trae su propio regex (tiene backslash o corchetes), se usa tal cual
    if (w.includes('\\') || w.includes('[')) return w;
    if (w.length < 5) return w;
    return w.split('').join('[\\s._*-]{0,1}');
  });
  return new RegExp(`\\b(${alternatives.join('|')})\\b`, 'i');
}

const INSULT_REGEX = buildInsultRegex();

const HARASSMENT_PATTERNS = [
  /\bdeja\s+de\s+hablarme\b/i,
  /\bno\s+te\s+metas\s+conmigo\b/i,
  /\bya\s+te\s+dije\s+que\s+(pares|te\s+calles)\b/i,
  /\bnadie\s+te\s+quiere\b/i,
  /\bdesaparece\b/i,
  /\bm[uú]erete\b/i,
];

/**
 * Decide si un mensaje falta el respeto Y va dirigido a alguien (no una
 * grosería general tipo "que dia de mierda" sin destinatario, que no
 * amerita sancion).
 * @param {string} content
 * @param {boolean} hasTargetMention true si el mensaje menciona a otro
 *   usuario humano (@alguien) o es una respuesta directa (reply) a otro
 *   mensaje -- ambas cosas indican que el insulto va dirigido a alguien.
 */
export function messageViolatesRespect(content, hasTargetMention = false) {
  const text = content || '';
  if (HARASSMENT_PATTERNS.some(p => p.test(text))) return true;

  const hasInsult = INSULT_REGEX.test(text);
  if (!hasInsult) return false;

  // Con mencion/reply directo a alguien: cualquier insulto cuenta.
  if (hasTargetMention) return true;

  // Sin mencion/reply: solo cuenta si esta en 2da persona clara ("sos/eres
  // un ...", "callate ..."), para no sancionar frases como "que dia de
  // mierda" (grosería sin destinatario humano).
  const secondPerson = /\b(sos|eres|callate|c[aá]llate)\b/i.test(text);
  return secondPerson;
}

const SANCTION_LADDER = [
  { kind: 'warn' },
  { kind: 'timeout', durationMs: 10 * 60 * 1000, label: '10 minutos' },
  { kind: 'timeout', durationMs: 60 * 60 * 1000, label: '1 hora' },
  { kind: 'kick' },
  { kind: 'ban' },
];

/**
 * Registra una falta y devuelve la sancion que corresponde aplicar segun
 * la escalada. No aplica la sancion en si (eso lo hace index.js con la
 * API de discord.js), solo decide cual toca. Usa cache en memoria para
 * decidir rapido, y persiste a Firestore en segundo plano (no bloquea la
 * respuesta).
 * @returns {{ kind: 'warn'|'timeout'|'kick'|'ban', durationMs?: number, label?: string, strikeNumber: number }}
 */
export function registerViolationAndGetSanction(guildId, userId) {
  const key = strikeKey(guildId, userId);
  const now = Date.now();
  const existing = strikesCache.get(key);

  let count = 1;
  if (existing && now - existing.lastStrikeAt < STRIKE_RESET_MS) {
    count = existing.strikes + 1;
  }

  strikesCache.set(key, { strikes: count, lastStrikeAt: now });
  persistStrikeAsync(guildId, userId, count, now);

  const idx = Math.min(count - 1, SANCTION_LADDER.length - 1);
  return { ...SANCTION_LADDER[idx], strikeNumber: count };
}

async function persistStrikeAsync(guildId, userId, count, timestamp) {
  if (!db) return;
  try {
    await db.collection('guilds').doc(guildId).collection('moderationStrikes').doc(userId).set({
      strikes: count,
      lastStrikeAt: timestamp,
    }, { merge: true });
  } catch (err) {
    console.error('[moderation/Firestore persistStrike]', err.message);
  }
}

// Se llama al arrancar (junto con hydrateModerationFlags) para no perder
// los strikes acumulados de un reinicio del bot en Render.
export async function hydrateStrikes() {
  if (!db) return;
  try {
    const guildsSnap = await db.collection('guilds').get();
    for (const guildDoc of guildsSnap.docs) {
      const strikesSnap = await guildDoc.ref.collection('moderationStrikes').get();
      strikesSnap.forEach(doc => {
        strikesCache.set(strikeKey(guildDoc.id, doc.id), doc.data());
      });
    }
  } catch (err) {
    console.error('[moderation/Firestore hydrateStrikes]', err.message);
  }
}

export async function clearStrikes(guildId, userId) {
  strikesCache.delete(strikeKey(guildId, userId));
  if (!db) return;
  try {
    await db.collection('guilds').doc(guildId).collection('moderationStrikes').doc(userId).delete();
  } catch (err) {
    console.error('[moderation/Firestore clearStrikes]', err.message);
  }
}

export default {
  isModerationActive,
  setModerationActive,
  hydrateModerationFlags,
  hydrateStrikes,
  messageViolatesRespect,
  registerViolationAndGetSanction,
  clearStrikes,
};
