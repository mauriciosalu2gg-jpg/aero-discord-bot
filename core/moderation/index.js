import { db } from '../../database/firebase.js';
import { getCached, setCached } from '../cache/firebaseCache.js';
import { askAI } from '../../services/aiManager.js';

// ── Configuracion de Penalizaciones ───────────────
const POINTS_TABLE = {
  SPAM: 10,
  INSULTO_LEVE: 20,
  AMENAZA: 40,
  NSFW: 70,
  RACISMO: 80,
  DOXXING: 100,
  SCAM: 100
};

const THRESHOLDS = {
  WARN: 20,
  MUTE: 40,
  KICK: 70,
  BAN: 100
};

const DECAY_POINTS = 20;
const DECAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// ── Regex Rapido ──────────────────────────────────
const SUSPICIOUS_WORDS = [
  'bolud', 'pendej', 'idiot', 'imbecil', 'estupid', 'inutil', 'basura', 'mierda',
  'sorete', 'gil', 'put', 'maric', 'hdp', 'malparid', 'desgraciad', 'trol',
  'pelotud', 'forr', 'nefast', 'matate', 'muerete', 'desaparece'
];
const SUSPICIOUS_REGEX = new RegExp(`\\b(${SUSPICIOUS_WORDS.join('|')})`, 'i');

// ── Flags de Activacion de Moderacion ─────────────
const activeGuildsCache = new Map();

export function isModerationActive(guildId) {
  return !!activeGuildsCache.get(guildId);
}

export async function setModerationActive(guildId, active) {
  activeGuildsCache.set(guildId, active);
  if (!db) return;
  await db.collection('guilds').doc(guildId).collection('stats').doc('moderation').set({
    active, updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function hydrateModerationFlags() {
  if (!db) return;
  try {
    const guildsSnap = await db.collection('guilds').get();
    for (const guildDoc of guildsSnap.docs) {
      const modDoc = await guildDoc.ref.collection('stats').doc('moderation').get();
      if (modDoc.exists) activeGuildsCache.set(guildDoc.id, !!modDoc.data().active);
    }
  } catch (err) {
    console.error('[moderation/hydrate]', err.message);
  }
}

export function looksSuspicious(text) {
  if (!text) return false;
  
  // Heuristicas basicas:
  // 1. Matchea palabras sospechosas
  // 2. Multiples links (spam/scam)
  // 3. Mayusculas excesivas (gritos + insultos)
  
  if (SUSPICIOUS_REGEX.test(text)) return true;
  
  const linkCount = (text.match(/http[s]?:\/\//g) || []).length;
  if (linkCount >= 3) return true;
  
  const uppercaseCount = (text.match(/[A-Z]/g) || []).length;
  if (uppercaseCount > 15 && uppercaseCount / text.length > 0.5) return true;
  
  return false;
}

import crypto from 'crypto';

const moderationCache = new Map();
const MODERATION_CACHE_TTL = 10 * 60 * 1000; // 10 min

// ── Moderacion con IA ─────────────────────────────
export async function analyzeWithAI(content, contextMessages = []) {
  const hash = crypto.createHash('md5').update(content).digest('hex');
  const now = Date.now();
  
  if (moderationCache.has(hash)) {
    const cached = moderationCache.get(hash);
    if (now - cached.timestamp < MODERATION_CACHE_TTL) {
      console.log(`[moderation] Cache hit para mensaje (Hash: ${hash})`);
      return cached.result;
    }
    moderationCache.delete(hash);
  }

  let contextStr = '';
  if (contextMessages.length > 0) {
    contextStr = `\nContexto reciente (para evaluar sarcasmo o continuacion):\n${contextMessages.map(m => `${m.authorName || 'Alguien'}: ${m.content}`).join('\n')}\n`;
  }

  const prompt = `Analiza este mensaje de Discord y clasifica su infraccion si la hay. Ten en cuenta el contexto para evitar falsos positivos (sarcasmo, juego, respuestas a insultos previos).${contextStr}
Mensaje a evaluar: "${content}"

Reglas:
- SPAM: publicidad repetitiva o links basura.
- INSULTO_LEVE: ofensas casuales (boludo, idiota).
- AMENAZA: desear daño fisico o amenazar.
- NSFW: contenido sexual texto/explicito.
- RACISMO: discriminacion por raza, religion, etc.
- DOXXING: revelar informacion personal.
- SCAM: estafas o phishing.
- NINGUNA: mensaje limpio.

Responde ÚNICAMENTE en JSON con esta estructura exacta:
{
  "rule_violated": "SPAM|INSULTO_LEVE|AMENAZA|NSFW|RACISMO|DOXXING|SCAM|NINGUNA",
  "confidence": 0 a 100,
  "action_suggested": "WARN|MUTE|KICK|BAN|NONE",
  "severity_reason": "Breve justificacion"
}`;

  try {
    const startedAt = Date.now();
    const response = await askAI([{ role: 'user', content: prompt }], 0, {
      systemExtra: 'Eres un sistema estricto de moderacion automatica. Devuelve SOLO JSON valido, sin markdown ni backticks.',
      intent: 'moderation' // Asegura que use modelo rapido
    });
    const latency = Date.now() - startedAt;
    
    // Limpiar markdown si la IA fue terca
    let jsonStr = response.text.trim();
    if (jsonStr.startsWith('\`\`\`json')) {
      jsonStr = jsonStr.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '');
    }
    
    const result = JSON.parse(jsonStr);
    
    console.log(`[metrics] Moderacion IA | Prov: ${response.provider} | Modelo: ${response.model} | Ms: ${latency} | Tokens: ${response.tokens}`);

    moderationCache.set(hash, { result, timestamp: now });
    
    return result;
  } catch (err) {
    console.error('[moderation] Error al analizar con IA:', err);
    return { rule_violated: 'NINGUNA', confidence: 0, action_suggested: 'NONE' };
  }
}

// ── Gestion de Puntos y Logs ───────────────────────

export async function getUserPoints(guildId, userId) {
  const docPath = `guilds/${guildId}/moderationStrikes/${userId}`;
  const data = await getCached(docPath, { points: 0, lastStrikeAt: 0 });
  
  const now = Date.now();
  let points = data.points;
  
  // Expiracion de puntos
  if (points > 0 && data.lastStrikeAt > 0) {
    const timePassed = now - data.lastStrikeAt;
    const decayPeriods = Math.floor(timePassed / DECAY_MS);
    if (decayPeriods > 0) {
      points = Math.max(0, points - (decayPeriods * DECAY_POINTS));
    }
  }
  
  return points;
}

export async function addPoints(guildId, userId, pointsToAdd) {
  const currentPoints = await getUserPoints(guildId, userId);
  const newPoints = currentPoints + pointsToAdd;
  
  const docPath = `guilds/${guildId}/moderationStrikes/${userId}`;
  setCached(docPath, {
    points: newPoints,
    lastStrikeAt: Date.now()
  });
  
  return newPoints;
}

export async function clearPoints(guildId, userId) {
  const docPath = `guilds/${guildId}/moderationStrikes/${userId}`;
  setCached(docPath, {
    points: 0,
    lastStrikeAt: 0
  });
}

export async function logModeration(guildId, userId, action, reason, aiConfidence = null) {
  if (!db) return;
  try {
    const logEntry = {
      userId,
      date: new Date().toISOString(),
      action,
      reason,
      aiConfidence,
      timestamp: Date.now()
    };
    // Guardamos en Firebase directo ya que es append-only
    await db.collection('guilds').doc(guildId).collection('moderationLogs').add(logEntry);
  } catch (err) {
    console.error('[moderation] Error al guardar log:', err);
  }
}

export function determineAction(points) {
  if (points >= THRESHOLDS.BAN) return 'BAN';
  if (points >= THRESHOLDS.KICK) return 'KICK';
  if (points >= THRESHOLDS.MUTE) return 'MUTE';
  if (points >= THRESHOLDS.WARN) return 'WARN';
  return 'NONE';
}

export function getPointsForRule(rule) {
  return POINTS_TABLE[rule] || 0;
}
