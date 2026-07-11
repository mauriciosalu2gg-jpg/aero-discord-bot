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

// Patrones de falta de respeto para el modo moderacion. Mas amplios que
// los de moodEngine (que son para tono de charla), ac apuntamos a ataques
// dirigidos a otra persona real del chat, no bromas generales.
const DIRECT_INSULT_PATTERNS = [
  /\b(callate|cállate)\s+(la\s+boca|hdp|imbecil|estupido)/i,
  /\b(eres|sos)\s+un[a]?\s+(mierda|basura|inutil|inútil|estupido|estúpido|idiota|imbecil|imbécil)\b/i,
  /\b(te\s+odio|nadie\s+te\s+quiere|desaparece|mueranse|muerete|muérete)\b/i,
  /\b(puto|puta|maricon|maricón|negro\s+de\s+mierda|india\s+de\s+mierda)\b.*\b(eres|sos|callate)\b/i,
  /\b(cierra\s+el\s+orto|cierra\s+la\s+bocota)\b/i,
];

const HARASSMENT_PATTERNS = [
  /\bdeja\s+de\s+hablarme\b/i,
  /\bno\s+te\s+metas\s+conmigo\b/i,
  /\bya\s+te\s+dije\s+que\s+(pares|te\s+calles)\b/i,
];

export function messageViolatesRespect(content) {
  const text = content || '';
  return DIRECT_INSULT_PATTERNS.some(p => p.test(text)) || HARASSMENT_PATTERNS.some(p => p.test(text));
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
