// core/behaviorFlags.js
// Flags de comportamiento controlables por Lara o Alero, por servidor:
// - swearing: si el bot puede decir groserias (ON por defecto)
// - factsAutoplay: si puede tirar datos curiosos solo cuando el chat esta muerto
// - ambientMode: si el bot comenta espontaneamente mas seguido en el canal
// - forceTalk: si el bot responde a CUALQUIER mensaje sin esperar mencion/DM
// - securityMode: modo "amable forzado" (sin groserias, sin ragebait, tono cuidado)
// - funador: habilita el mood "funador" (tono acusador/dramatico, cita con
//   @mencion y formato Discord) SOLO cuando alguien le habla directo o le
//   pide que "acuse". No activa vigilancia de chat, recoleccion de
//   evidencia ni reclutamiento de aliados -- es solo un tono reactivo.
//
// Persistido en Firestore (guilds/{guildId}/stats/behaviorFlags) para
// sobrevivir reinicios en Render. Se cachea en memoria de proceso para
// lecturas rapidas (cada mensaje consulta getFlags) y se hidrata una vez
// al arrancar.

import { db } from '../database/firebase.js';

const DEFAULTS = {
  swearing: true,
  factsAutoplay: true,
  respectfulOnly: false,
  ambientMode: false,
  forceTalk: false,
  securityMode: false,
  funador: false,
  verboseMemorySteps: true,
};

// guildId (o 'global') -> flags completos ya resueltos con DEFAULTS
const cache = new Map();

function scope(guildId) {
  return guildId || 'global';
}

export function getFlags(guildId) {
  const key = scope(guildId);
  return { ...DEFAULTS, ...(cache.get(key) || {}) };
}

export async function setFlag(guildId, key, value) {
  const scopeKey = scope(guildId);
  const updated = { ...DEFAULTS, ...(cache.get(scopeKey) || {}), [key]: value };
  cache.set(scopeKey, updated);

  if (db) {
    try {
      await db.collection('guilds').doc(scopeKey).collection('stats').doc('behaviorFlags').set(updated, { merge: true });
    } catch (err) {
      console.error('[behaviorFlags/Firestore set]', err.message);
    }
  }
  return updated;
}

// Se llama al arrancar el bot para precargar los flags guardados de cada
// servidor, asi no se pierden los ajustes de Lara/Alero en cada reinicio.
export async function hydrateFlags() {
  if (!db) return;
  try {
    const guildsSnap = await db.collection('guilds').get();
    for (const guildDoc of guildsSnap.docs) {
      const flagsDoc = await guildDoc.ref.collection('stats').doc('behaviorFlags').get();
      if (flagsDoc.exists) cache.set(guildDoc.id, flagsDoc.data());
    }
    console.log(`[behaviorFlags] Flags precargados para ${guildsSnap.size} servidor(es).`);
  } catch (err) {
    console.error('[behaviorFlags/Firestore hydrate]', err.message);
  }
}

// Frases naturales que detectan intencion de "parar" sin necesidad de un
// comando explicito, para cuando Lara simplemente escribe "para" en el chat.
const STOP_PHRASES = [
  'para', 'ya para', 'parale', 'callate', 'cállate', 'ya no digas groserias',
  'no digas mas groserias', 'se respetuoso', 'sé respetuoso', 'compotate',
  'compórtate', 'basta', 'ya basta', 'deja de decir groserias',
  'no cuentes mas datos curiosos', 'deja los datos curiosos',
];

const RESUME_PHRASES = [
  'ya puedes', 'ya podes', 'segui como antes', 'sigue como antes',
  'vuelve a la normalidad', 'ya puedes decir groserias', 'permiso concedido',
  'te doy permiso', 'dale de nuevo', 'segui con los datos curiosos',
];

export function matchesStopPhrase(content) {
  const lower = (content || '').toLowerCase();
  return STOP_PHRASES.some(p => lower.includes(p));
}

export function matchesResumePhrase(content) {
  const lower = (content || '').toLowerCase();
  return RESUME_PHRASES.some(p => lower.includes(p));
}

export default { getFlags, setFlag, hydrateFlags, matchesStopPhrase, matchesResumePhrase };
