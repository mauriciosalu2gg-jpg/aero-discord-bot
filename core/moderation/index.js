import { db } from '../../database/firebase.js';
import { getCached, setCached } from '../cache/firebaseCache.js';
import { askAI } from '../../services/aiManager.js';

// ── Configuracion de Penalizaciones (Reglamento Oficial §05) ────────────
const POINTS_TABLE = {
  SPAM:              10,
  INSULTO_LEVE:      20,
  ACOSO:             30,
  IMPERSONACION:     30,
  AMENAZA:           40,
  DESINFORMACION:    30,
  NSFW:              70,
  VIOLENCIA_GRAFICA: 70,
  RACISMO:           80,
  DISCURSO_ODIO:     80,
  DOXXING:           100,
  SCAM:              100,
  CONTENIDO_MENOR:   100,
  LENGUAJE_VULGAR:   10
};

const THRESHOLDS = {
  WARN: 0,
  MUTE: 40,
  KICK: 70,
  BAN: 100
};

const DECAY_POINTS = 20;
const DECAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// ── Regex Rapido ──────────────────────────────────
const SUSPICIOUS_WORDS = [
  // Insultos clásicos
  'bolud', 'pendej', 'idiot', 'imbecil', 'estupid', 'inutil', 'basura', 'mierda',
  'sorete', 'gil', 'put', 'maric', 'hdp', 'malparid', 'desgraciad', 'trol',
  'pelotud', 'forr', 'nefast', 'matate', 'muerete', 'desaparece',
  // Mexicanos / Latinos explícitos
  'chinga', 'chingar', 'chingada', 'cabron', 'mamada', 'mamaguevo', 'mamagwebo',
  'conchatumadre', 'culero', 'pinche', 'joto', 'zorra', 'perra', 'mierdero', 'pendejada',
  'verga', 'vrga', 'mierd', 'ojete',
  // Abreviaciones comunes
  'ptm', 'alv', 'ctm', 'cdsm', 'kbro', 'mrd', 'mmg', 'hdspm', 'csm', 'ojt', 'pdj', 
  'pndjo', 'pndejo', 'cbrn', 'kbron', 'vrg', 'vga', 'pt', 'ptos', 'ptas',
  'chngd', 'mmd', 'mmdas', 'mmhvo', 'pnch', 'mrcn', 'zrra', 'prra', 'clr',
  'pndj', 'pndjs', 'hdtpm', 'lpm', 'qlo', 'qlos', 'vdg', 'vldg', 'hp', 'hdlgp', 'cdspm'
];
const SUSPICIOUS_REGEX = new RegExp(`\\b(${SUSPICIOUS_WORDS.join('|')})\\b`, 'i');

// ── Flags de Activacion de Moderacion (Con soporte para ciclos temporales) ──
const activeGuildsCache = new Map();

export function isModerationActive(guildId) {
  const state = activeGuildsCache.get(guildId);
  return !!(state && state.active && state.status === 'active');
}

export async function setModerationActive(guildId, active, durationMs = 0, channelId = null, userId = null) {
  const state = {
    active,
    status: active ? 'active' : 'disabled',
    cycleStart: active ? Date.now() : 0,
    cycleDuration: active ? durationMs : 0,
    nextActionAt: (active && durationMs > 0) ? Date.now() + durationMs : 0,
    channelId: active ? channelId : null,
    userWhoActivated: active ? userId : null
  };

  activeGuildsCache.set(guildId, state);
  if (!db) return;
  await db.collection('guilds').doc(guildId).collection('stats').doc('moderation').set({
    ...state,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function hydrateModerationFlags() {
  if (!db) return;
  try {
    const guildsSnap = await db.collection('guilds').get();
    for (const guildDoc of guildsSnap.docs) {
      const modDoc = await guildDoc.ref.collection('stats').doc('moderation').get();
      if (modDoc.exists) {
        const data = modDoc.data();
        activeGuildsCache.set(guildDoc.id, {
          active: !!data.active,
          status: data.status || (data.active ? 'active' : 'disabled'),
          cycleStart: data.cycleStart || Date.now(),
          cycleDuration: data.cycleDuration || 0,
          nextActionAt: data.nextActionAt || 0,
          channelId: data.channelId || null,
          userWhoActivated: data.userWhoActivated || null
        });
      }
    }
  } catch (err) {
    console.error('[moderation/hydrate]', err.message);
  }
}

export async function processTimedModeration(client) {
  const now = Date.now();
  for (const [guildId, state] of activeGuildsCache.entries()) {
    if (!state || !state.active || state.cycleDuration <= 0) continue;

    if (state.status === 'active' && now >= state.nextActionAt) {
      console.log(`[moderation-timer] Ciclo activo finalizado para el servidor ${guildId}. Evaluando infracciones...`);
      let hasInfractions = false;
      try {
        if (db) {
          const logsSnap = await db.collection('guilds').doc(guildId).collection('moderationLogs')
            .where('timestamp', '>=', state.cycleStart)
            .get();
          hasInfractions = logsSnap.size > 0;
        }
      } catch (err) {
        console.error('[moderation-timer] Error consultando logs de infracciones:', err.message);
      }

      const guild = client.guilds.cache.get(guildId);
      const targetChannel = guild?.channels.cache.get(state.channelId) || 
                            guild?.channels.cache.find(c => c.isTextBased() && (c.name.includes('avisos') || c.name.includes('anuncios') || c.name.includes('pruebas')));

      if (!hasInfractions) {
        // Opción A: Desactivar por 10 horas
        const restDuration = 10 * 60 * 60 * 1000; // 10 horas
        state.status = 'resting';
        state.nextActionAt = now + restDuration;
        
        await saveModerationState(guildId, state);

        if (targetChannel) {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder()
            .setTitle('💤 Auto-Moderación en Reposo')
            .setColor(0x3498DB)
            .setDescription(`No se detectó ninguna infracción en las últimas **${Math.round(state.cycleDuration / (60 * 60 * 1000))} horas**.\n\nLa moderación automática entrará en estado de reposo por **10 horas** para descansar. Vuelve automáticamente después. 🌸`)
            .setTimestamp();
          await targetChannel.send({ embeds: [embed] }).catch(() => {});
        }
      } else {
        // Continuar activa por otro ciclo
        state.cycleStart = now;
        state.nextActionAt = now + state.cycleDuration;

        await saveModerationState(guildId, state);

        if (targetChannel) {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder()
            .setTitle('🛡️ Auto-Moderación Prolongada')
            .setColor(0xE74C3C)
            .setDescription(`Se detectaron infracciones en el ciclo anterior.\n\nLa moderación automática continuará **Activa** por otras **${Math.round(state.cycleDuration / (60 * 60 * 1000))} horas** para proteger el servidor. ⚔️`)
            .setTimestamp();
          await targetChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } else if (state.status === 'resting' && now >= state.nextActionAt) {
      // Reposo finalizado, volver a activar
      state.status = 'active';
      state.cycleStart = now;
      state.nextActionAt = now + state.cycleDuration;

      await saveModerationState(guildId, state);

      const guild = client.guilds.cache.get(guildId);
      const targetChannel = guild?.channels.cache.get(state.channelId) || 
                            guild?.channels.cache.find(c => c.isTextBased() && (c.name.includes('avisos') || c.name.includes('anuncios') || c.name.includes('pruebas')));

      if (targetChannel) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setTitle('🛡️ Auto-Moderación Reactivada')
          .setColor(0x2ECC71)
          .setDescription(`El periodo de reposo de 10 horas ha finalizado.\n\nLa moderación automática vuelve a estar **Activa** por las próximas **${Math.round(state.cycleDuration / (60 * 60 * 1000))} horas**. ⚔️`)
          .setTimestamp();
        await targetChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
}

async function saveModerationState(guildId, state) {
  if (!db) return;
  try {
    await db.collection('guilds').doc(guildId).collection('stats').doc('moderation').set({
      ...state,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('[moderation-timer] Error guardando estado:', err.message);
  }
}

export function looksSuspicious(text) {
  if (!text) return false;
  
  // Heuristicas basicas:
  // 1. Matchea palabras sospechosas y variaciones leetspeak (numeros por letras)
  const normalized = text.toLowerCase()
    .replace(/@/g, 'a').replace(/4/g, 'a')
    .replace(/3/g, 'e').replace(/1/g, 'i')
    .replace(/!/g, 'i').replace(/0/g, 'o')
    .replace(/5/g, 's').replace(/7/g, 't');

  if (SUSPICIOUS_REGEX.test(text) || SUSPICIOUS_REGEX.test(normalized)) return true;
  
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
export async function analyzeWithAI(content, contextMessages = [], isStaff = false) {
  const hash = crypto.createHash('md5').update(content + isStaff).digest('hex');
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

  const prompt = `Eres el sistema de moderación automatizado del servidor de Discord "Alero" (Novarito). Tu función es analizar mensajes y clasificar infracciones al Reglamento Oficial del servidor.

EL USUARIO PERTENECE AL STAFF: ${isStaff ? 'SÍ' : 'NO'}
CONTEXTO RECIENTE:${contextStr}
MENSAJE A EVALUAR: "${content}"

CLASIFICACIÓN DE INFRACCIONES (Reglamento §02 y §05):
- SPAM: publicidad no autorizada, invitaciones a otros servidores, links sin contexto, mensajes repetitivos. (10 pts)
- INSULTO_LEVE: ofensas directas, burlas o lenguaje despectivo hacia otro miembro. (20 pts)
- ACOSO: hostigamiento reiterado, persecución o intimidación hacia un usuario. (30 pts)
- IMPERSONACION: hacerse pasar por otro usuario, staff o entidad oficial. (30 pts)
- AMENAZA: desear o amenazar con daño físico, emocional o económico. (40 pts)
- DESINFORMACION: compartir información deliberadamente falsa con intención de engañar. (30 pts)
- NSFW: contenido sexual explícito, nudismo o pornografía fuera de canales habilitados. (70 pts)
- VIOLENCIA_GRAFICA: imágenes o descripciones de violencia extrema o gore. (70 pts)
- RACISMO: discriminación por raza, etnia, origen u otras características protegidas. (80 pts)
- DISCURSO_ODIO: incitación al odio o violencia por cualquier característica personal protegida. (80 pts)
- DOXXING: revelar datos personales de terceros sin consentimiento. (100 pts - BAN inmediato)
- SCAM: phishing, estafas, malware o solicitud de credenciales. (100 pts - BAN inmediato)
- CONTENIDO_MENOR: cualquier contenido sexual que involucre menores. (100 pts - BAN inmediato + reporte)
- LENGUAJE_VULGAR: uso de groserías, palabras altisonantes o vulgaridades explícitas (incluyendo abreviaciones como ptm, alv, ctm, etc) sin ir dirigidas a ofender a alguien en específico. (10 pts)
- NINGUNA: el mensaje no viola ninguna norma del reglamento.

IMPORTANTE:
1. Analiza el contexto antes de clasificar. Considera el sarcasmo y respuestas a provocaciones previas. NO clasifiques como infracción conversaciones informales sanas.
2. NO hay excepciones para el Staff ni para nadie. Todos son tratados por igual. Si un administrador dice groserías, cuenta como LENGUAJE_VULGAR.
3. El sistema automático ya maneja los niveles (3 a 6 avisos antes de sancionar de verdad), así que no te preocupes por ser estricto. Aplica la infracción que corresponda sin miedo.
4. Cero tolerancia a NSFW/Doxxing/Scam.
5. RECONOCIMIENTO DE ABREVIATURAS: "ptm" (puta madre), "alv" (a la verga), "ctm" (concha tu madre), "hdp" (hijo de puta) son groserías y deben clasificarse como LENGUAJE_VULGAR como mínimo.

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "rule_violated": "SPAM|INSULTO_LEVE|ACOSO|IMPERSONACION|AMENAZA|DESINFORMACION|NSFW|VIOLENCIA_GRAFICA|RACISMO|DISCURSO_ODIO|DOXXING|SCAM|CONTENIDO_MENOR|LENGUAJE_VULGAR|NINGUNA",
  "confidence": 0,
  "action_suggested": "WARN|MUTE|KICK|BAN|NONE",
  "severity_reason": "Descripcion neutral y profesional de la infraccion (NUNCA digas que fue JUEGO_STAFF)"
}`;

  try {
    const startedAt = Date.now();
    const response = await askAI([{ role: 'user', content: prompt }], 0, {
      systemExtra: 'Eres un sistema de moderación profesional. Devuelve SOLO JSON válido sin markdown ni backticks. Sé neutral, preciso y respetuoso en todas las descripciones.',
      intent: 'moderation'
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
