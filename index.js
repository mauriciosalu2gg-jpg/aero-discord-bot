// index.js
import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import http from 'node:http';
import config from './config.js';
import secrets from './secrets.js';
import { askAI, startConfigRefresh } from './services/aiManager.js';
import { validateAllProviders } from './services/ai/modelValidator.js';

import { getUserMemory, saveUserMemory, getRelevantTopics } from './core/memory/index.js';
import { getUserMemoryConfig, formatProfileForPrompt } from './core/memory/config.js';
import { commandDefinitions } from './interactions/commandDefinitions.js';
import { isOwner, isSubCreator } from './core/permissions.js';
import { analyzeContext } from './core/contextAnalyzer.js';
import { detectMood } from './core/moodEngine.js';
import { trimHistory, summarizeOld, estimateTokens, buildUltraCompactContext } from './core/tokenOptimizer.js';
import { splitHumanized, delayBetweenParts } from './core/messageSplitter.js';
import { pickMuletilla } from './core/personality.js';
import { webSearch, needsWebSearch } from './core/webSearch.js';
import { initServerMemory, deleteServerMemory } from './core/memory/serverMemoryManager.js';
import { computeThinkingDelay, humanizedTyping } from './core/typingDelay.js';
import { getFlags, matchesStopPhrase, matchesResumePhrase, setFlag, hydrateFlags } from './core/behaviorFlags.js';
import { markActivity, startIdleWatcher } from './core/idleFacts.js';
import { looksSuspicious, analyzeWithAI, getUserPoints, addPoints, getPointsForRule, determineAction, logModeration, isModerationActive, hydrateModerationFlags, processTimedModeration, getModerationState } from './core/moderation/index.js';
import { handleInteraction } from './interactions/interactionCreate.js';
import { isPendingFunadorAnswer } from './core/funadorSession.js';
import { handleApiKeyQuestion } from './commands/apikey.js';
import { getActiveProvider, startHealthReporting } from './services/ai/providerHealth.js';
import { db } from './database/firebase.js';
import { isBasicModel } from './config/providers.js';
import { askMemoryEngine, isMemoryEngineAvailable } from './services/ai/memoryRouter.js';

const PORT = process.env.PORT || 3000;
const startTime = Date.now();
let lastAIResponse = { provider: 'ninguno', model: 'ninguno' };

// ═══════════════════════════════════════════════════════════════
// 🎨 EMOJIS — Application Emojis del portal de Novarito.
//    Subidos en: Discord Developer Portal > Novarito > Emojis
//    Fallback unicode automático si el emoji no está disponible.
// ═══════════════════════════════════════════════════════════════
const EMOJIS = {
  thinking: '<:pensar:1527960192787025920>',      // 💡  Generando respuesta (Chat Engine)
  memory:   '<:servidor:1527959988184682506>',    // 📚  Memory Engine activo
  recall:   '<:recuperar:1528121773764116651>',   // 🔄  Recuperando desde memoria
  save:     '<:hojita:1527960400975630436>',      // 📝  Guardando en memoria
  done:     '<:aceptar:1527959750443012187>',     // ✅  Operación completada
  error:    '<:equis:1527958663485198386>',       // ❌  Error / Insuficiente
  warning:  '<:advertencia:1527958443338633296>', // ⚠️  Advertencia
};

/** Formatea los mensajes de error/insuficiencia de memoria con el emoji equis */
function formatMemoryErrorStatus(errorType, rawMessage = '') {
  const equis = EMOJIS.error;

  switch (errorType) {
    case 'insufficient':
      return `-# ${equis} *No se tuvo suficiente información guardada para completar la consulta*`;
    case 'timeout':
      return `-# ${equis} *Tiempo de espera agotado al conectar con el servidor de memoria (Timeout)*`;
    case 'token_limit':
      return `-# ${equis} *Límite de memoria alcanzado (Límite de uso de tokens de IA)*`;
    case '404':
      return `-# ${equis} *Couldn't manage memory error (HTTP 404: Registro no localizado)*`;
    case 'invalid_format':
      return `-# ${equis} *Formato de memoria desproporcionado o desestructurado*`;
    default:
      return `-# ${equis} *Couldn't manage memory error ${rawMessage ? `(${rawMessage.slice(0, 40)})` : ''}*`;
  }
}

/** Convierte automáticamente emojis unicode genéricos en emojis personalizados del servidor */
function replaceUnicodeWithServerEmojis(text, guild = null) {
  if (!text) return text;
  
  let customEmojiList = ['<:aceptar:1527959750443012187>', '<:pensar:1527960192787025920>', '<:hojita:1527960400975630436>', '<:servidor:1527959988184682506>', '<:recuperar:1528121773764116651>'];
  if (guild && guild.emojis?.cache?.size > 0) {
    customEmojiList = guild.emojis.cache.first(6).map(e => e.toString());
  }

  const defaultAccept = customEmojiList[0] || '<:aceptar:1527959750443012187>';
  const defaultThink = customEmojiList[1] || customEmojiList[0] || '<:pensar:1527960192787025920>';
  const defaultLeaf = customEmojiList[2] || customEmojiList[0] || '<:hojita:1527960400975630436>';

  const unicodeMap = {
    '😂': defaultAccept,
    '😊': defaultLeaf,
    '💖': defaultAccept,
    '😜': defaultLeaf,
    '🔥': defaultThink,
    '💭': defaultThink,
    '👍': defaultAccept,
    '😍': defaultLeaf,
    '😎': defaultAccept,
    '🥰': defaultLeaf,
    '😅': defaultThink,
    '😄': defaultAccept,
    '😉': defaultLeaf,
    '😁': defaultAccept,
  };

  let clean = text;
  for (const [uEmoji, cEmoji] of Object.entries(unicodeMap)) {
    clean = clean.replaceAll(uEmoji, cEmoji);
  }
  return clean;
}

// Trackea canales activos (donde el bot ya hablo al menos una vez) para el
// watcher de inactividad, sin necesidad de guardar esto en DB.
const trackedChannels = new Map(); // channelId -> { guildId }

// Rate limiter para evitar spam a la IA y evitar el límite de peticiones (429)
const userRateLimits = new Map();
const activeUserProcesses = new Set();
const MAX_REQUESTS = 5; // Peticiones máximas permitidas
const RATE_LIMIT_WINDOW = 60000; // En un lapso de 1 minuto (60000 ms)

/** Formatea ms a texto: "3 segundos", "2 minutos", "1 hora" */
function formatThinkingTime(ms) {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs} segundo${secs !== 1 ? 's' : ''}`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minuto${mins !== 1 ? 's' : ''}`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hora${hrs !== 1 ? 's' : ''}`;
}

/**
 * Detecta si el usuario interactúa explícitamente con la memoria.
 * isSave: quiere guardar algo  |  isRecall: quiere recuperar algo
 */
function detectMemoryIntent(content) {
  const isRecall = /qu[eé]\s+(recuerdas|sabes|tienes)|dime\s+(qu[eé]|lo\s+que)\s+(tienes|hay|guardaste|recuerdas)|qu[eé]\s+guardaste|busca\s+en\s+(tu|mi|la)?\s*memoria|tienes\s+guardado|mu[eé]strame\s+tu\s+memoria|memoria\s+global|memoria_global/i.test(content);
  const isSave   = !isRecall && /recuerda\s+(que|esto|eso)|guard[aá]?(?:lo|la|me|rlo|rla)?(?:\s+(?:de|en|a|para))?\s+(?:tu\s+)?(?:memoria\s+)?(?:que|esto|eso|el chat|la conversaci[oó]n|este pdf|esta imagen|este link|este enlace|todo esto)|guard[aá]?(?:lo|la|me|rlo|rla)?.{0,40}\b(?:memoria|chat|conversaci[oó]n|pdf|imagen|link|enlace)\b|memoriza|no olvides|acu[eé]rdate\s+de/i.test(content);
  return { isSave, isRecall, isExplicit: isSave || isRecall };
}

function extractTopicKeyword(content) {
  const clean = String(content || '').replace(/[?/!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const stopWords = new Set(['dime', 'que', 'recuerdas', 'sabes', 'tienes', 'busca', 'mi', 'tu', 'la', 'de', 'en', 'los', 'las', 'el', 'un', 'una', 'por', 'favor', 'guarda', 'recordar']);
  const words = clean.split(' ').filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
  if (words.length > 0) {
    return words.slice(0, 3).join(' ');
  }
  return 'temas y conversaciones';
}

/**
 * Genera pasos de razonamiento dinámicos via Memory Engine (IA).
 * Para claude-style retorna objetos {type:'step'|'think', text}.
 * Para arrows/stars retorna strings simples.
 * @param {string} content
 * @param {'save'|'recall'} mode
 * @param {'arrows'|'stars'|'claude'} bulletStyle
 */
async function generateMemoryStepsAI(content, mode, bulletStyle = 'arrows') {
  const topic = extractTopicKeyword(content);

  const fallbackSave = [
    `Identificando información clave: "${topic.slice(0, 30)}"`,
    `Indexando datos en el perfil de memoria global`,
    `Asociando preferencias y referencias al usuario`,
    `Guardando registro de forma permanente`,
  ];
  const fallbackRecall = [
    `Consultando índice global de memoria sobre "${topic.slice(0, 30)}"`,
    `Escaneando registros de servidores y canales guardados`,
    `Verificando hechos confirmados e identidades del usuario`,
    `Sintetizando información verified encontrada`,
  ];
  const fallbackClaudeSave = [
    { type: 'step', text: `Identificando información relevante sobre "${topic.slice(0, 30)}"` },
    { type: 'think', text: `Analizo la frase del usuario para estructurar los datos clave que deben conservarse.` },
    { type: 'step', text: `Indexando registros en el archivo global del servidor` },
    { type: 'think', text: `Asocio las referencias para tenerlas disponibles de inmediato en cualquier canal.` },
    { type: 'step', text: `Confirmando almacenamiento permanente` },
    { type: 'think', text: `Guardo la información en la base de datos de memoria sin alteraciones.` },
  ];
  const fallbackClaudeRecall = [
    { type: 'step', text: `Escaneando base de datos de memoria para "${topic.slice(0, 30)}"` },
    { type: 'think', text: `Examino los índices locales y globales buscando registros exactos sobre esta consulta.` },
    { type: 'step', text: `Filtrando hechos verificados y referencias cruzadas` },
    { type: 'think', text: `Separo los datos confirmados de cualquier ambigüedad para asegurar precisión.` },
    { type: 'step', text: `Consolidando informe de memoria` },
    { type: 'think', text: `Organizo los hallazgos reales para entregárselos al asistente en tiempo real.` },
  ];

  if (!isMemoryEngineAvailable()) {
    if (bulletStyle === 'claude') return mode === 'save' ? fallbackClaudeSave : fallbackClaudeRecall;
    return mode === 'save' ? fallbackSave : fallbackRecall;
  }

  let prompt;
  if (bulletStyle === 'claude') {
    prompt = mode === 'save'
      ? `El usuario dijo: "${content.slice(0, 300)}". Genera 3 a 4 pares TÉCNICOS Y CONTEXTUALES sobre guardar el tema "${topic}". Formato:\nPASO: [acción técnica en gerundio sobre ${topic}]\nRAZON: [explicación lógica de la acción].`
      : `El usuario dijo: "${content.slice(0, 300)}". Genera 3 a 4 pares TÉCNICOS Y CONTEXTUALES sobre buscar el tema "${topic}". Formato:\nPASO: [acción técnica de búsqueda sobre ${topic}]\nRAZON: [explicación lógica de la búsqueda].`;
  } else {
    prompt = mode === 'save'
      ? `Genera 4 pasos técnicos en gerundio de cómo guardar la info sobre "${topic}". Máximo 6 palabras por paso. Sin viñetas.`
      : `Genera 4 pasos técnicos en gerundio de cómo consultar la memoria sobre "${topic}". Máximo 6 palabras por paso. Sin viñetas.`;
  }

  try {
    const resPromise = askMemoryEngine('topic', [{ role: 'user', content: prompt }], 0.3).catch(() => null);
    const timeoutPromise = sleep(3000).then(() => null);
    const res = await Promise.race([resPromise, timeoutPromise]);

    if (!res) {
      if (bulletStyle === 'claude') return mode === 'save' ? fallbackClaudeSave : fallbackClaudeRecall;
      return mode === 'save' ? fallbackSave : fallbackRecall;
    }

    if (bulletStyle === 'claude') {
      const lines = res.split('\n').map(l => l.trim()).filter(Boolean);
      const parsed = [];
      for (const line of lines) {
        if (/^PASO:\s*/i.test(line)) {
          parsed.push({ type: 'step', text: line.replace(/^PASO:\s*/i, '').slice(0, 120) });
        } else if (/^RAZ[OÓ]N:\s*/i.test(line)) {
          parsed.push({ type: 'think', text: line.replace(/^RAZ[OÓ]N:\s*/i, '').slice(0, 250) });
        }
      }
      return parsed.length >= 2 ? parsed.slice(0, 8) : (mode === 'save' ? fallbackClaudeSave : fallbackClaudeRecall);
    }

    const steps = res.split('\n').map(s => s.trim().replace(/^[-*•\d\.\s]+/, '').slice(0, 150)).filter(s => s.length > 3 && !/ojo|siento|tranquilo|sensaciones/i.test(s)).slice(0, 5);
    return steps.length >= 2 ? steps : (mode === 'save' ? fallbackSave : fallbackRecall);
  } catch {
    if (bulletStyle === 'claude') return mode === 'save' ? fallbackClaudeSave : fallbackClaudeRecall;
    return mode === 'save' ? fallbackSave : fallbackRecall;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function startThinkingStatus(message, { emoji = EMOJIS.thinking, label = 'Pensando' } = {}) {
  const state = { msg: null, interval: null, start: Date.now(), emoji, label, dots: 0 };

  const render = () => `${state.emoji} *${state.label}${'.'.repeat(state.dots)}*`;

  try {
    state.msg = await message.channel.send(`${state.emoji} *${state.label}*`);
    state.interval = setInterval(() => {
      state.dots = (state.dots % 3) + 1;
      state.msg.edit(render()).catch(() => null);
    }, 1600);
  } catch (err) {
    console.warn('[ui] No se pudo enviar estado de pensamiento:', err.message);
  }

  state.stop = () => {
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
  };

  return state;
}

async function updateThinkingStatus(state, { emoji, label } = {}) {
  if (!state?.msg) return;
  if (emoji) state.emoji = emoji;
  if (label) state.label = label;
  state.dots = 0;
  await state.msg.edit(`${state.emoji} *${state.label}*`).catch(() => null);
}

function memoryUiTiming(content, mode) {
  return {
    introMs: 2200,
    stepMs: 2500,
    intervalMs: 1200,
  };
}

function computeExtraThinkingDelay({ baseMs, hasWebContext, intent, memoryIntent, contentLength }) {
  let minMs = baseMs;
  let maxMs = baseMs;

  if (hasWebContext) {
    minMs = 4000;
    maxMs = 20000;
  } else if (intent === 'document') {
    minMs = 4500;
    maxMs = 18000;
  } else if (memoryIntent?.isExplicit) {
    minMs = 3500;
    maxMs = 14000;
  }

  if (contentLength > 2500) maxMs = Math.max(maxMs, 16000);
  if (maxMs <= baseMs) return baseMs;
  return clamp(baseMs + Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs, minMs, maxMs);
}

async function runExplicitMemoryUi(message, content, mode, details = '', thinkingState = null, verboseSteps = true, forceClaude = false) {
  if (thinkingState) {
    if (typeof thinkingState.stop === 'function') thinkingState.stop();
    if (thinkingState.interval) {
      clearInterval(thinkingState.interval);
      thinkingState.interval = null;
    }
  }

  let memoryMsg = thinkingState?.msg || null;
  let interval = null;
  const phaseLabel = mode === 'save' ? 'Guardando en la memoria' : 'Recuperando de la memoria';
  const phaseEmoji = mode === 'save' ? EMOJIS.save : EMOJIS.recall;
  const finalLabel = mode === 'save' ? 'Memoria actualizada' : 'Memoria recuperada';
  const timing = memoryUiTiming(content, mode);

  // ── MODO COMPACTO (cuando no es verboseSteps) ──
  if (!verboseSteps) {
    try {
      let createdNew = false;
      if (!memoryMsg) {
        memoryMsg = await message.channel.send(`-# ${EMOJIS.memory} *Managing memory...*`).catch(() => null);
        createdNew = true;
      }

      if (memoryMsg) {
        let dot = 0;
        const interval = setInterval(() => {
          dot = (dot % 3) + 1;
          memoryMsg.edit(`-# ${EMOJIS.memory} *Managing memory${'.'.repeat(dot)}*`).catch(() => null);
        }, 600);

        await sleep(2200);
        clearInterval(interval);

        const statusLine = `-# ${EMOJIS.done} *${finalLabel}*`;
        if (thinkingState) thinkingState.memoryStatusLine = statusLine;

        if (thinkingState?.aiResponseText) {
          const elapsedMs = Date.now() - (thinkingState.startTime || Date.now());
          const thinkingTimeStr = formatThinkingTime(elapsedMs);
          const thinkingLine = `-# ${EMOJIS.thinking} *Pensó por ${thinkingTimeStr}*`;
          const combinedFooter = `${thinkingLine}\n${statusLine}`;
          await memoryMsg.edit(`${thinkingState.aiResponseText}\n${combinedFooter}`).catch(() => null);

          // Tras 3 minutos (180,000 ms = 3 min), remueve "Memoria actualizada" dejando solo "Pensó por..."
          setTimeout(async () => {
            try {
              if (thinkingState?.aiResponseText) {
                await memoryMsg.edit(`${thinkingState.aiResponseText}\n${thinkingLine}`).catch(() => null);
              }
            } catch { /* ignore */ }
          }, 180000);
        } else {
          await memoryMsg.edit(statusLine).catch(() => null);
        }
      }
    } catch (err) {
      console.warn('[memory-ui] Error en modo compacto:', err.message);
    }
    return;
  }

  // ── MODO DETALLADO (Pasos ↳, ✧ o ❥) ──
  const roll = Math.random();
  const bulletStyle = forceClaude ? 'claude' : (roll < 0.50 ? 'arrows' : 'stars');
  const bullet = bulletStyle === 'arrows' ? '↳' : bulletStyle === 'stars' ? '✧' : '❥';

  try {
    let createdNew = false;
    if (!memoryMsg) {
      memoryMsg = await message.channel.send(`-# ${EMOJIS.memory} *Managing memory...*`).catch(() => null);
      createdNew = true;
    }

    if (!memoryMsg) return;

    // Cambiar inmediatamente la burbuja de "Pensando..." a "Managing memory..." en el primer cuadro
    await memoryMsg.edit(`-# ${EMOJIS.memory} *Managing memory...*`).catch(() => null);

    let dot = 0;
    interval = setInterval(() => {
      dot = (dot % 3) + 1;
      memoryMsg.edit(`-# ${EMOJIS.memory} *Managing memory${'.'.repeat(dot)}*`).catch(() => null);
    }, timing.intervalMs);

    await sleep(timing.introMs);
    clearInterval(interval);

    let phaseDot = 0;
    const phaseInterval = setInterval(() => {
      phaseDot = (phaseDot % 3) + 1;
      memoryMsg.edit(`-# ${EMOJIS.memory} *Managing memory.*\n-# ${phaseEmoji} *${phaseLabel}${'.'.repeat(phaseDot)}*`).catch(() => null);
    }, timing.intervalMs);

    const steps = await generateMemoryStepsAI(content, mode, bulletStyle);
    clearInterval(phaseInterval);

    const recordedSteps = [];
    if (details) {
      recordedSteps.push(`-# ${EMOJIS.save} Contenido: ${details.slice(0, 150)}`);
    }

    for (const step of steps) {
      let stepStr = '';
      if (typeof step === 'object') {
        stepStr = step.type === 'think' ? `-# *" ${step.text} "*` : `-# ❥ **${step.text}**`;
      } else {
        stepStr = `-# ${bullet} ${step}`;
      }
      recordedSteps.push(stepStr);

      // Si excede 6 pasos o 1000 caracteres, compactar pasos antiguos para NO sobrepasar 2000 chars de Discord
      let renderedStepsText = '';
      if (recordedSteps.length > 6) {
        const oldStepCount = recordedSteps.length - 4;
        const recentSteps = recordedSteps.slice(-4);
        renderedStepsText = `\n-# ${bullet} *[${oldStepCount} pasos anteriores compactados en memoria]*\n${recentSteps.join('\n')}`;
      } else {
        renderedStepsText = `\n${recordedSteps.join('\n')}`;
      }

      await memoryMsg.edit(`-# ${EMOJIS.memory} *Managing memory.*\n-# ${phaseEmoji} *${phaseLabel}.*${renderedStepsText}`).catch(() => null);
      
      const delay = bulletStyle === 'claude' ? timing.stepMs + 600 : timing.stepMs;
      await sleep(delay);
    }

    // Paso final: Confirmación o Advertencia de datos
    const finalDetailStr = details ? ` (${details.slice(0, 80)})` : '';
    let statusLine = `-# ${EMOJIS.done} *${finalLabel}${finalDetailStr}*`;

    if (mode === 'recall' && (!content || content.length < 3)) {
      statusLine = formatMemoryErrorStatus('insufficient');
    }

    if (thinkingState) thinkingState.memoryStatusLine = statusLine;

    if (thinkingState?.aiResponseText) {
      const elapsedMs = Date.now() - (thinkingState.startTime || Date.now());
      const thinkingTimeStr = formatThinkingTime(elapsedMs);
      const thinkingLine = `-# ${EMOJIS.thinking} *Pensó por ${thinkingTimeStr}*`;
      const combinedFooter = `${thinkingLine}\n${statusLine}`;
      await memoryMsg.edit(`${thinkingState.aiResponseText}\n${combinedFooter}`).catch(() => null);

      // Tras 3 minutos (180,000 ms = 3 min), remueve "Memoria actualizada" dejando solo "Pensó por..."
      setTimeout(async () => {
        try {
          if (thinkingState?.aiResponseText) {
            await memoryMsg.edit(`${thinkingState.aiResponseText}\n${thinkingLine}`).catch(() => null);
          }
        } catch { /* ignore */ }
      }, 180000);
    } else {
      await memoryMsg.edit(statusLine).catch(() => null);
    }

  } catch (err) {
    if (interval) clearInterval(interval);
    console.warn('[memory-ui] Error en UI de memoria explícita:', err.message);
    let errType = 'default';
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('timeout')) errType = 'timeout';
    else if (msg.includes('404') || msg.includes('not found')) errType = '404';
    else if (msg.includes('token') || msg.includes('limit') || msg.includes('429')) errType = 'token_limit';

    const errStatus = formatMemoryErrorStatus(errType, err.message);
    if (memoryMsg) await memoryMsg.edit(errStatus).catch(() => null);
  }
}

function extractExplicitSaveFacts(content) {
  const clean = String(content || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const patterns = [
    /(?:recuerda|record[aá]|guarda|guardame|gu[aá]rdame|gu[aá]rdalo|gu[aá]rdalo|memoriza|no olvides)(?:\s+(?:que|esto|eso|de memoria que|en memoria que|en tu memoria que|en tu memoria|en memoria))?\s+(.+)/i,
    /(?:acu[eé]rdate\s+de\s+que)\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return [match[1].trim().slice(0, 500)];
  }

  return [clean.slice(0, 500)];
}

async function saveIdentityFactsMentionedInMemoryRequest(content) {
  const clean = String(content || '').replace(/\s+/g, ' ').trim();
  const matches = [...clean.matchAll(/(?:usuario|user|persona)?\s*(?:con\s+)?ID[:\s]*(\d{17,19})\s+(?:es|tiene|le gusta|prefiere|se llama|usa)\s+([^.;\n]+)/gi)];
  if (matches.length === 0) return;

  const { saveUserIdentity } = await import('./core/memory/index.js');
  for (const match of matches.slice(0, 4)) {
    const userId = match[1];
    const fact = match[2].trim();
    if (!fact) continue;
    await saveUserIdentity(userId, {
      discordId: userId,
      names: [],
      nicknames: [],
      facts: [`ID ${userId}: ${fact}`],
    });
  }
}

function handleRateLimit(userId) {
  const now = Date.now();
  if (!userRateLimits.has(userId)) userRateLimits.set(userId, { times: [], warned: false });
  const data = userRateLimits.get(userId);
  data.times = data.times.filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (data.times.length >= MAX_REQUESTS) {
    if (!data.warned) {
      data.warned = true;
      return 'WARN';
    }
    return 'BLOCKED';
  }
  data.times.push(now);
  data.warned = false;
  return 'ALLOW';
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

function isNaturalPrompt(text) {
  const clean = (text || '').trim();
  if (!clean) return false;
  if (/^[/!]/.test(clean)) return false;
  if (/^[a-z0-9_-]{1,24}$/i.test(clean) && !/\s/.test(clean) && clean.length <= 4) return false;
  return true;
}

// Servidor HTTP keepalive para Render + UptimeRobot
http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: client?.isReady?.() ? 'online' : 'connecting',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      tag: client?.user?.tag ?? null,
      guilds: client?.guilds?.cache?.size ?? 0,
      lastProvider: lastAIResponse.provider,
      lastModel: lastAIResponse.model,
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => console.log(`[http] Keepalive en puerto ${PORT}`));

client.once('clientReady', async () => {
  console.log(`[discord] Conectado como ${client.user.tag}`);
  
  // Limpiar comandos a nivel de servidor (guild commands) e inicializar memoria singular
  client.guilds.cache.forEach(async (g) => {
    config.registerGuild(g);
    await initServerMemory(g.id, g.name).catch(() => {});
    try {
      await g.commands.set([]);
    } catch (err) {
      console.warn(`[discord] No se pudieron limpiar comandos locales en ${g.name}:`, err.message);
    }
  });
  startConfigRefresh(5);

  // Auto-deploy de comandos globales al arrancar para que Discord siempre tenga
  // la lista actualizada (esto borra automaticamente comandos viejos como /ia).
  try {
    const _rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (clientId) {
      await _rest.put(Routes.applicationCommands(clientId), { body: commandDefinitions });
      console.log(`[discord] Comandos globales sincronizados (${commandDefinitions.length} comandos).`);
    }
  } catch (err) {
    console.warn('[discord] No se pudieron sincronizar comandos globales:', err.message);
  }
  config.updateBotStatus(client, lastAIResponse);
  setInterval(() => config.updateBotStatus(client, lastAIResponse), 30000);

  // Valida contra la API oficial de cada proveedor que sus modelos
  // configurados en config/providers.js todavia existan, ANTES de que un
  // usuario dispare un 404 en produccion por un modelo retirado. No
  // bloquea el arranque del bot si tarda o falla (fail-open).
  validateAllProviders(secrets.getAvailableProviders())
    .then(() => console.log('[modelValidator] Validacion de modelos completada.'))
    .catch(err => console.warn('[modelValidator] Error validando modelos:', err.message));

  client.on('guildCreate', async (guild) => {
    console.log(`[guildCreate] Bot añadido al servidor: ${guild.name} (${guild.id})`);
    config.registerGuild(guild);
    await initServerMemory(guild.id, guild.name).catch(() => {});
  });

  client.on('guildDelete', async (guild) => {
    console.log(`[guildDelete] Bot removido del servidor: ${guild.name} (${guild.id})`);
    await deleteServerMemory(guild.id).catch(() => {});
  });

  // Precarga desde Firestore los flags de comportamiento y el estado de
  // moderacion/strikes de cada servidor, para no perder configuracion en
  // cada reinicio/redeploy de Render.
  await hydrateFlags().catch(err => console.error('[hydrate/flags]', err.message));
  await hydrateModerationFlags().catch(err => console.error('[hydrate/moderation]', err.message));

  // Iniciar ciclo de comprobación de moderación temporal cada 30 segundos
  setInterval(() => {
    processTimedModeration(client).catch(err => console.error('[moderation-timer] Error en el ciclo:', err.message));
  }, 30000);

  // Watcher de inactividad: si un canal lleva 6+ horas sin actividad y no
  // esta "calladito", el bot tira un dato curioso por su cuenta.
  startIdleWatcher(
    () => [...trackedChannels.entries()].map(([channelId, v]) => ({ channelId, guildId: v.guildId })),
    async (channelId) => {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;
      const guild = channel.guild || null;

      const idlePrompts = [
        'El chat lleva horas muerto. Tira un dato curioso o random que genere conversación, en tu propio estilo casual.',
        'Nadie ha hablado en horas. Di algo que llame la atención, una opinión random, una pregunta al aire, o algo gracioso.',
        'El canal está en silencio. Rompe el hielo con algo interesante: un dato loco, una pregunta para el chat, o simplemente saluda de forma inesperada.',
        'Chat muerto. Actúa como si quisieras reactivar la charla de forma natural, di lo primero que se te ocurra.',
      ];
      const idlePrompt = idlePrompts[Math.floor(Math.random() * idlePrompts.length)];

      const response = await askAI(
        [{ role: 'user', content: idlePrompt }],
        0,
        { guild, channelName: channel.name, swearingAllowed: getFlags(guild?.id).swearing }
      ).catch(() => null);

      if (response?.text) {
        await channel.send(response.text).catch(() => {});
        markActivity(channelId);
      }
    }
  );

  // Escuchar comandos desde el Panel de Control (Firestore)
  if (db) {
    // Iniciar reporte de estado de IA en tiempo real para el panel web
    const providerNames = secrets.getAvailableProviders().map(p => p.name);
    startHealthReporting(db, providerNames, client, 60000);
    db.collection('bot_actions')
      .where('status', '==', 'pending')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.action === 'send_message' && data.guildId && data.channelId && data.content) {
              console.log(`[panel] Recibido mensaje para enviar a ${data.guildId}/${data.channelId}`);
              try {
                const guild = client.guilds.cache.get(data.guildId);
                if (!guild) throw new Error('Servidor no encontrado');
                // Quitar cualquier prefijo # si lo enviaron desde el panel
                let channelId = data.channelId.replace(/^#/, '');
                // Si el channelId no es numérico, intentamos buscarlo por nombre
                let channel = guild.channels.cache.get(channelId);
                if (!channel) {
                  channel = guild.channels.cache.find(c => c.name === channelId || c.name === channelId.toLowerCase());
                }
                
                if (channel && channel.isTextBased()) {
                  await channel.send(data.content);
                  await change.doc.ref.update({ status: 'sent', sentAt: new Date().toISOString() });
                  console.log(`[panel] Mensaje enviado con éxito al canal ${channel.name || channelId}`);
                } else {
                  throw new Error('Canal de texto no encontrado');
                }
              } catch (err) {
                console.error('[panel] Error al enviar mensaje:', err.message);
                await change.doc.ref.update({ status: 'error', error: err.message, failedAt: new Date().toISOString() });
              }
            }
          }
        });
      }, (err) => {
        console.error('[panel] Error en el listener de bot_actions:', err.message);
      });
  }
});

client.on('guildCreate', g => config.registerGuild(g));
client.on('guildUpdate', (oldG, newG) => config.registerGuild(newG));
client.on('channelCreate', c => { if (c.guild) config.syncChannels(c.guild); });
client.on('channelUpdate', (oldC, newC) => { if (newC.guild) config.syncChannels(newC.guild); });
client.on('channelDelete', c => { if (c.guild) config.syncChannels(c.guild); });

// ── Slash command unico: /bot <grupo> <subcomando> ──
client.on('interactionCreate', handleInteraction);

// ── Moderacion automatica: corre ANTES que cualquier otra logica, para
//    cualquier mensaje humano, este o no el bot mencionado. ──
async function runAutoModeration(message) {
  const guildId = message.guild?.id;
  if (!guildId || !isModerationActive(guildId)) return false;

  if (!looksSuspicious(message.content)) return false;

  // Obtener memoria local para pasar contexto
  let recentMessages = [];
  try {
    const memory = await getUserMemory(message.author.id, guildId, 'local', message.channel.id); // solo necesitamos leer lo reciente
    if (memory && memory.messages) {
      recentMessages = memory.messages.slice(-3); // Ultimos 3
    }
  } catch (err) {
    console.error('[moderation] Error obteniendo contexto:', err.message);
  }

  const staffRoleIds = ['1493970384289140766', '1494880439960211618', '1493312223458889838'];
  const isStaff = message.member?.roles?.cache.some(r => staffRoleIds.includes(r.id)) || message.member?.permissions?.has('Administrator') || false;

  // Si parece sospechoso, usamos IA con el contexto
  const aiResult = await analyzeWithAI(message.content, recentMessages, isStaff);
  if (aiResult.rule_violated === 'NINGUNA') return false;

  const botMember = message.guild.members.me;
  const botHasAdmin = !!botMember?.permissions?.has?.('Administrator');
  
  let action = 'WARN';
  let totalPoints = 0;
  
  // Si la IA tiene baja confianza, solo advertimos y no sumamos puntos,
  // o sumamos 0 puntos pero queda registrado.
  if (aiResult.confidence < 85) {
    console.log(`[moderation] Baja confianza (${aiResult.confidence}%). Se omite sanción para evitar falsos positivos.`);
    return false;
  }
  const pointsToAdd = getPointsForRule(aiResult.rule_violated);
  totalPoints = await addPoints(guildId, message.author.id, pointsToAdd);
  action = determineAction(totalPoints);

  const member = message.member;

  await logModeration(guildId, message.author.id, action, aiResult.severity_reason, aiResult.confidence);

  // Siempre eliminar el mensaje dañino, sin importar el nivel de sanción.
  await message.delete().catch(err => console.error('[moderation] Fallo al borrar mensaje:', err.message));

  try {
    const { EmbedBuilder } = await import('discord.js');
    const levels = [
      { threshold: 100, label: 'Baneo permanente', color: 0xED4245 },
      { threshold: 70,  label: 'Expulsión',         color: 0xE67E22 },
      { threshold: 40,  label: 'Silencio temporal', color: 0xF1C40F },
      { threshold: 20,  label: 'Advertencia',       color: 0x3498DB },
      { threshold: 0,   label: 'Aviso Menor',       color: 0x95A5A6 },
    ];
    const currentLevel = levels.find(l => totalPoints >= l.threshold) || levels[4];
    const nextLevel = levels.slice().reverse().find(l => totalPoints < l.threshold);

    const formatEmbed = (actionType, reason, pts, authorId, rule) => {
      let title = '⚠️ Sistema de Auto-Moderación';
      if (actionType === 'WARN') title = '⚠️ Advertencia de Moderación';
      if (actionType === 'MUTE') title = '🔇 Silencio Temporal Aplicado';
      if (actionType === 'KICK') title = '👢 Expulsión Aplicada';
      if (actionType === 'BAN') title = '🔨 Baneo Permanente Aplicado';

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(currentLevel.color)
        .setDescription(`Se ha detectado una infracción a las normas de convivencia del servidor.`)
        .addFields(
          { name: '👤 Usuario', value: `<@${authorId}>`, inline: true },
          { name: '📜 Regla Violada', value: `\`${rule}\``, inline: true },
          { name: '📊 Acumulado', value: `\`${pts} / 100 pts\``, inline: true },
          { name: '💬 Motivo / Detalle', value: reason || 'Comportamiento no permitido en el chat.' }
        );
        
      if (nextLevel) {
        embed.addFields({ name: '🚨 Próxima Sanción', value: `**${nextLevel.label}** al alcanzar **${nextLevel.threshold} pts**`, inline: false });
      }

      embed.setFooter({ text: 'Novarito Moderación • Expira 20 pts cada 30 días sin faltas' })
        .setTimestamp();
      return embed;
    };

    const modState = getModerationState(guildId);
    const guardians = modState.guardians || [];

    // Capturar información de evidencia del mensaje del usuario ANTES de ser eliminado
    const messageContentText = message.content || '[Sin contenido de texto / Archivo adjunto]';
    const authorAvatar = message.author.displayAvatarURL({ dynamic: true, size: 256 });
    const firstAttachment = message.attachments.find(a => a.contentType?.startsWith('image/') || a.url?.match(/\.(png|jpg|jpeg|gif|webp)$/i));

    // Enviar el embed de sanción directamente por Mensaje Directo (MD) a cada Guardián activo con la EVIDENCIA CAPTURADA
    if (guardians.length > 0) {
      let actionTitle = 'Advertencia';
      if (action === 'MUTE') actionTitle = 'Silencio Temporal (Mute)';
      if (action === 'KICK') actionTitle = 'Expulsión (Kick)';
      if (action === 'BAN') actionTitle = 'Baneo Permanente (Ban)';

      const dmEmbed = new EmbedBuilder()
        .setTitle(`🚨 Alerta de Moderación: ${actionTitle}`)
        .setColor(currentLevel.color)
        .setDescription(`Se registró una infracción al reglamento en **${message.guild?.name}** (Canal: <#${message.channel.id}>).`)
        .addFields(
          { name: '👤 Usuario Infractor', value: `<@${message.author.id}> (\`${message.author.tag}\` | ID: \`${message.author.id}\`)`, inline: false },
          { name: '📜 Regla Violada', value: `\`${aiResult.rule_violated}\``, inline: true },
          { name: '📊 Acumulado', value: `\`${totalPoints} / 100 pts\``, inline: true },
          { name: '💬 Motivo / Detalle', value: aiResult.severity_reason || 'Comportamiento no permitido.' },
          { 
            name: '📸 EVIDENCIA CAPTURADA (Texto del Mensaje)', 
            value: `\`\`\`text\n${messageContentText.slice(0, 950)}\n\`\`\`` 
          }
        )
        .setThumbnail(authorAvatar)
        .setFooter({ text: `Novarito Moderación • Evidencia capturada` })
        .setTimestamp();

      if (firstAttachment) {
        dmEmbed.setImage(firstAttachment.url);
      }

      for (const guardianId of guardians) {
        (async () => {
          try {
            const gUser = await client.users.fetch(guardianId).catch(() => null);
            if (gUser) {
              await gUser.send({
                content: `🔔 **Alerta de Moderación** en **${message.guild?.name}** (#${message.channel?.name || 'chat'}):`,
                embeds: [dmEmbed]
              }).catch(() => {});
            }
          } catch (e) {
            console.warn(`[moderation] No se pudo enviar MD al guardián ${guardianId}:`, e.message);
          }
        })();
      }
    }

    const publicEmbed = formatEmbed(action, aiResult.severity_reason, totalPoints, message.author.id, aiResult.rule_violated);

    switch(action) {
      case 'WARN':
        await message.channel.send({
          content: `<@${message.author.id}>`,
          embeds: [publicEmbed],
          allowedMentions: { users: [message.author.id] }
        });
        break;
      case 'MUTE':
        if (member && member.moderatable) {
          await member.timeout(10 * 60 * 1000, `AutoMod: ${aiResult.rule_violated}`);
          await message.channel.send({
            content: `<@${message.author.id}>`,
            embeds: [publicEmbed],
            allowedMentions: { users: [message.author.id] }
          });
        } else {
          await message.channel.send({
            content: `⚠️ <@${message.author.id}> el sistema intentó **Mutearte** por acumulación de puntos, pero tu rol actual impide la sanción automática.\n> **Infracción:** ${aiResult.severity_reason}`
          });
        }
        break;
      case 'KICK':
        if (member && member.kickable) {
          await member.kick(`AutoMod: ${aiResult.rule_violated}`);
          await message.channel.send({
            content: `<@${message.author.id}>`,
            embeds: [publicEmbed],
            allowedMentions: { users: [message.author.id] }
          });
        } else {
          await message.channel.send({
            content: `⚠️ <@${message.author.id}> el sistema intentó **Expulsarte** por acumulación de puntos, pero tu rol actual impide la sanción automática.\n> **Infracción:** ${aiResult.severity_reason}`
          });
        }
        break;
      case 'BAN':
        if (member && member.bannable) {
          await member.ban({ reason: `AutoMod: ${aiResult.rule_violated}` });
          await message.channel.send({
            content: `<@${message.author.id}>`,
            embeds: [publicEmbed],
            allowedMentions: { users: [message.author.id] }
          });
        } else {
          await message.channel.send({
            content: `⚠️ <@${message.author.id}> el sistema intentó **Banearte** permanentemente, pero tu rol actual impide la sanción automática.\n> **Infracción:** ${aiResult.severity_reason}`
          });
        }
        break;
    }
  } catch (err) {
    console.error('[moderation] Error sancionando:', err.message);
  }

  return true;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const botId = client.user?.id || process.env.DISCORD_CLIENT_ID;
  const isDirectMention = Boolean(
    (client.user && message.mentions.has(client.user)) ||
    (botId && message.mentions.users.has(botId)) ||
    (botId && message.content.includes(botId))
  );
  const isNameCalled = /novarito|nova|novaro/i.test(message.content);
  const isMentioned = isDirectMention || isNameCalled;
  const isReplyToBot = message.reference?.messageId
    ? await message.fetchReference().then(ref => ref.author?.id === botId || ref.author?.id === client.user?.id).catch(() => false)
    : false;
  const isDM = message.channel.type === 1;
  const wasExplicitlyCalled = isMentioned || isReplyToBot || isDM;

  const guildId = message.guild?.id;
  const channelId = message.channelId;

  trackedChannels.set(channelId, { guildId });
  markActivity(channelId);

  if (isPendingFunadorAnswer(channelId, message.author.id)) {
    return;
  }

  const wasSanctioned = await runAutoModeration(message).catch(() => false);
  if (wasSanctioned) return;

  const isAuthorizedAdmin = isOwner(message.author) || isSubCreator(message.author) || isAdminOrHigher(message.author) || message.member?.permissions?.has?.('Administrator');

  if (isAuthorizedAdmin) {
    if (matchesStopPhrase(message.content)) {
      await setFlag(guildId, 'swearing', false);
      await setFlag(guildId, 'factsAutoplay', false);
    } else if (matchesResumePhrase(message.content)) {
      await setFlag(guildId, 'swearing', true);
      await setFlag(guildId, 'factsAutoplay', true);
    }

    const rawContent = message.content.toLowerCase();
    if (/no (muestres|pongas|enseñes|saques|hagas) (los )?pasos|oculta (los )?pasos|sin pasos|compacta(damente|do)?|pasos (de memoria )?desactivados?|quita (los )?pasos/i.test(rawContent)) {
      await setFlag(guildId, 'verboseMemorySteps', false);
    } else if (/(muestra|pon|enseña|activa|regresa|vuelve con) (los )?pasos|pasos (de memoria )?activados?|con pasos|explicito(s)?/i.test(rawContent)) {
      await setFlag(guildId, 'verboseMemorySteps', true);
    }
  }

  const flags = getFlags(guildId);

  const PROTECTED_NAMES_RE = /\b(lara|le0[_\s]?lara|theo|theogr|gio|lag|larita)\b/i;
  const NEGATIVE_SENTIMENT_RE = /\b(odi[ao]|maldita|culpa|idiota|tonta|basura|pendet|inutil|inútil|no sirve|pésima|nefasta|estup|shut up|calla|callat|peor|porqu[eé] no|mentir|minti|feo|horrible|horrible)\b/i;
  const isDefenseNeeded = !isMentioned && !isReplyToBot && !isDM && !flags.forceTalk &&
    PROTECTED_NAMES_RE.test(message.content) && NEGATIVE_SENTIMENT_RE.test(message.content);

  const isBotChannel = Boolean(message.channel?.name && /bot|comando|chat|general|pruebas|comunidad|debates/i.test(message.channel.name));
  const shouldRespond = isMentioned || isReplyToBot || isDM || isBotChannel || flags.forceTalk || isDefenseNeeded;
  if (!shouldRespond) return;

  if (guildId) config.registerGuild(message.guild);

  const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();
  const content = cleanContent || (wasExplicitlyCalled ? 'hola' : '');
  if (!content) return;

  const wasApiKeyQuestion = await handleApiKeyQuestion(message, guildId ? await config.getTokenUsage(guildId).catch(() => null) : null).catch(() => false);
  if (wasApiKeyQuestion) return;
  // ----------------------------------

  try {
    // 1. Memoria persistente del usuario
    const userConfig = await getUserMemoryConfig(message.author.id);
    const memoryIntent = detectMemoryIntent(content);
    let thinkingMsg = null;
    let thinkingInterval = null;
    let thinkingStart = Date.now();
    let activeTopicLabel = 'charla';
    const thinkingState = await startThinkingStatus(message);
    thinkingMsg = thinkingState.msg;
    thinkingInterval = thinkingState.interval;
    thinkingStart = thinkingState.start;

    // Si es una petición explícita de memoria, iniciar UI INMEDIATAMENTE en paralelo
    let memoryUiPromise = null;
    if (memoryIntent.isSave || memoryIntent.isRecall || memoryIntent.isExplicit) {
      const isUserAdminOrHigher = isOwner(message.author) || isSubCreator(message.author) || isAdminOrHigher(message.author) || message.member?.permissions?.has?.('Administrator');
      let effectiveVerboseSteps = true;
      let askedForSteps = false;

      if (/compacta(damente|do)?|sin (mostrar )?pasos|no (muestres|pongas) (los )?pasos|oculta (los )?pasos/i.test(content)) {
        effectiveVerboseSteps = false;
      }
      if (isUserAdminOrHigher && /muéstrame|muestrame|enseñame|enséñame|dime|dinos|los pasos|pasos|con pasos|paso a paso|detallado|explicame|explícame|explicito|explícito/i.test(content)) {
        askedForSteps = true;
        effectiveVerboseSteps = true;
      }

      const modeType = memoryIntent.isRecall ? 'recall' : 'save';
      memoryUiPromise = runExplicitMemoryUi(message, content, modeType, '', thinkingState, effectiveVerboseSteps, askedForSteps).catch(() => null);
    }

    const memory = await getUserMemory(message.author.id, guildId, userConfig.mode, channelId);
    
    // Procesar archivos adjuntos si los hay y extraer enlaces
    let finalContent = content;
    let urlText = '';
    const { processAttachments, processUrls } = await import('./services/documentReader.js');
    
    if (message.attachments.size > 0) {
      const attachmentText = await processAttachments(message.attachments);
      if (attachmentText) finalContent += `\n${attachmentText}`;

      const attachmentSummaries = [];
      for (const attachment of message.attachments.values()) {
        const isVideo = attachment.contentType?.includes('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(attachment.name || '');
        const isImage = attachment.contentType?.includes('image') || /\.(png|jpg|jpeg|gif|webp)$/i.test(attachment.name || '');
        const typeLabel = isVideo ? 'video MP4' : isImage ? 'imagen' : 'archivo';
        attachmentSummaries.push(`[ARCHIVO ADJUNTO RECIBIDO]: Tipo: ${typeLabel}, Nombre: "${attachment.name}", URL directa: ${attachment.url}`);
      }
      finalContent += `\n${attachmentSummaries.join('\n')}\n⚠️ INSTRUCCIÓN DE ADJUNTOS: El usuario te envió este archivo/video directamente en Discord. Si te pide guardarlo en memoria, confirma que ya guardaste el archivo con la URL proporcionada.`;
    }

    urlText = await processUrls(content);
    if (urlText) finalContent += `\n${urlText}`;

    // Guardar referencias de media. Si el usuario pidió guardar, se espera antes de responder.
    const mediaSavePromise = (async () => {
      try {
        const { saveMediaReference } = await import('./core/memory/index.js');
        // Guardar attachments
        for (const attachment of message.attachments.values()) {
          const isVideo = attachment.contentType?.includes('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(attachment.name || '');
          const isImage = attachment.contentType?.includes('image') || /\.(png|jpg|jpeg|gif|webp)$/i.test(attachment.name || '');
          const isPdf = attachment.contentType?.includes('pdf') || /\.pdf$/i.test(attachment.name || '');
          const type = isVideo ? 'video' : isImage ? 'image' : isPdf ? 'pdf' : 'file';

          await saveMediaReference(message.author.id, {
            type,
            url: attachment.url,
            name: attachment.name,
            description: `${type} subido por el usuario a Discord`,
          });
        }
        // Guardar links del mensaje (si los hay y no son maliciosos)
        const urlMatches = content.match(/(https?:\/\/[^\s]+)/g) || [];
        for (const url of urlMatches.slice(0, 3)) {
          await saveMediaReference(message.author.id, {
            type: 'link',
            url,
            name: url,
            description: 'enlace compartido en el chat',
          });
        }
      } catch { /* silencioso */ }
    })();
    if (memoryIntent.isSave && userConfig.mode !== 'off') {
      await mediaSavePromise;
    }

    // Los recuerdos largos no son instrucciones: se presentan como contexto
    const rememberedFacts = (memory.facts || [])
      .slice(-25)
      .map(fact => String(fact).replace(/\s+/g, ' ').slice(0, 360))
      .filter(Boolean);
    let summaryForAI = memory.summary || '';
    if (rememberedFacts.length > 0) {
      const modeLabel = userConfig.mode === 'global' ? 'GLOBAL (COMPARTIDA ENTRE TODOS LOS SERVIDORES Y CANALES)' : 'LOCAL (ESTE SERVIDOR)';
      summaryForAI += `\n\nDATOS Y HECHOS GUARDADOS EN TU MEMORIA DE ESTE USUARIO (MODO ${modeLabel}):\n- ${rememberedFacts.join('\n- ')}\n⚠️ INSTRUCCIÓN CRÍTICA DE MEMORIA: Los datos anteriores son HECHOS REALES que tú recuerdas de este usuario (incluyendo sus gustos, datos, archivos y pláticas de otros servidores en los que hablaron). ÚSALOS DIRECTAMENTE para responderle cuando te pregunte qué recuerdas o qué tienes guardado. NUNCA digas que no recuerdas nada si tienes datos en esta lista.`;
    } else {
      summaryForAI += `\n\nESTADO DE TU MEMORIA GLOBAL: No hay datos u hechos guardados aún de este usuario en otros servidores ni en este chat. Si el usuario te pregunta qué recuerdas de otros servidores o qué tienes guardado, responde con total sinceridad: "Neta, de otros servidores o chats aún no tengo datos guardados en mi memoria global, pero en cuanto platiquemos ahí lo voy registrando todo." NUNCA inventes recuerdos de juegos de Fortnite, servidores de música o historias falsas que jamás han sido guardadas.`;
      if (memoryIntent?.isRecall && thinkingState) {
        thinkingState.memoryStatusLine = formatMemoryErrorStatus('insufficient');
      }
    }

    // Inyectar identidades relevantes si el mensaje menciona a alguien
    try {
      const { getUserIdentity } = await import('./core/memory/index.js');
      const mentionedUsers = [...message.mentions.users.values()];
      
      const idMatches = content.match(/\b(id:\s*)?(\d{17,19})\b/gi) || [];
      const extractedIds = [...new Set(idMatches.map(m => m.match(/\d{17,19}/)[0]))];
      
      const identityContext = [];
      
      if (mentionedUsers.length > 0 || extractedIds.length > 0) {
        for (const mu of mentionedUsers.slice(0, 3)) {
          const identity = await getUserIdentity(mu.id);
          if (identity && (identity.names?.length || identity.facts?.length)) {
            const names = [...(identity.names || []), ...(identity.nicknames || [])].join(', ');
            const facts = (identity.facts || []).slice(-5).join('; ');
            identityContext.push(`Usuario @${mu.username} (conocido como: ${names}): ${facts}`);
          }
        }
        
        for (const extId of extractedIds.slice(0, 3)) {
          if (mentionedUsers.some(mu => mu.id === extId)) continue;
          const identity = await getUserIdentity(extId);
          if (identity && (identity.names?.length || identity.facts?.length)) {
            const names = [...(identity.names || []), ...(identity.nicknames || [])].join(', ');
            const facts = (identity.facts || []).slice(-5).join('; ');
            const display = identity.names?.[0] || extId;
            identityContext.push(`Usuario ${display} (ID: ${extId}, conocido como: ${names}): ${facts}`);
          }
        }
        
        if (identityContext.length > 0) {
          summaryForAI += `\n\nIDENTIDADES CONOCIDAS:\n${identityContext.join('\n')}`;
        }
      }
    } catch { /* silencioso */ }

    // Recuperación inteligente: inyectar los TOP 5 temas relevantes
    try {
      const relevantTopics = await getRelevantTopics(message.author.id, content, 5);
      if (relevantTopics.length > 0) {
        activeTopicLabel = relevantTopics[0].title || 'charla';
        const topicsSummary = relevantTopics.map(t => `[${t.title}] ${t.summary}`).join('\n');
        summaryForAI += `\n\nTEMAS ANTERIORES RELEVANTES:\n${topicsSummary}`;
      }
    } catch { /* sin topics aún */ }

    memory.messages = memory.messages || [];
    memory.messages.push({
      role: 'user',
      content: finalContent,
      authorName: message.author.username,
      displayName: message.member?.displayName || message.author.globalName || message.author.username,
      createdAt: message.createdAt?.toISOString(),
      serverName: message.guild?.name || 'Direct Message',
      serverId: guildId || 'direct',
    });

    if (memoryIntent.isSave && userConfig.mode !== 'off') {
      const explicitFacts = extractExplicitSaveFacts(finalContent);
      memory.facts = [...(memory.facts || [])];
      for (const fact of explicitFacts) {
        if (!memory.facts.some(existing => existing.toLowerCase() === fact.toLowerCase())) {
          memory.facts.push(fact);
        }
      }
      // Enriquecer con identidad del usuario actual: ID, nombre y contexto del servidor
      const identityTag = `[ID:${message.author.id}] ${message.author.displayName || message.author.username} (servidor: ${guildId || 'DM'}, canal: ${channelId})`;
      if (!memory.facts.some(f => f.includes(`[ID:${message.author.id}]`))) {
        memory.facts.push(`Identidad en este servidor: ${identityTag}`);
      }
      
      // ⚡ GUARDADO EN TIEMPO REAL INSTANTÁNEO A DISCO Y FIREBASE
      try {
        const { saveUserMemory } = await import('./core/memory/index.js');
        const { saveServerMemory } = await import('./core/memory/serverMemoryManager.js');
        await saveUserMemory(message.author.id, guildId, userConfig.mode, memory, channelId);
        if (guildId) {
          await saveServerMemory(guildId, {
            serverId: guildId,
            name: message.guild?.name || 'Servidor',
            facts: memory.facts,
            users: {
              [message.author.id]: {
                facts: memory.facts,
                summary: memory.summary || ''
              }
            }
          });
        }
      } catch (err) {
        console.warn('[memory-realtime] Error al persistir memoria en tiempo real:', err.message);
      }

      await saveIdentityFactsMentionedInMemoryRequest(finalContent).catch(err => {
        console.warn('[identity] No se pudieron guardar hechos por ID:', err.message);
      });
      const details = explicitFacts.join(' | ').slice(0, 260);
      
      // Artificial thinking delay for explicit memory
      const extraThinkingDelay = computeExtraThinkingDelay({ baseMs: 1600, hasWebContext: false, intent: 'chat', memoryIntent: { isExplicit: true }, contentLength: finalContent.length });
      if (extraThinkingDelay > 1600) await sleep(extraThinkingDelay);

      if (memoryUiPromise) {
        await memoryUiPromise;
      }
    } else if (memoryIntent.isRecall && userConfig.mode !== 'off') {
      if (memoryUiPromise) {
        await memoryUiPromise;
      }
    }

    // 2. Contexto y mood
    const context = analyzeContext(memory.messages, message, client.user.id);
    context.isOwnerMessage = isOwner(message.author);
    const moodInfo = detectMood(context);

    if (moodInfo.mood === 'funador' && !flags.funador) {
      moodInfo.mood = 'dramatico';
    }

    // 3. Resumen de historial viejo + recorte por tokens
    const cachedProvider = getActiveProvider();
    const usingBasicModel = cachedProvider && isBasicModel(cachedProvider.name, cachedProvider.model);

    let summary, recent;
    if (usingBasicModel) {
      const compact = buildUltraCompactContext(memory.messages);
      summary = compact.compactSummary;
      recent = compact.recent;
    } else {
      ({ summary, recent } = summarizeOld(memory.messages));
    }

    const recentTokens = recent.reduce((s, h) => s + estimateTokens(h.content), 0);
    const historyBudget = usingBasicModel ? 1200 : 4000;
    const llmHistory = trimHistory(recent, historyBudget).map(h => ({ role: h.role, content: h.content }));

    // 4. Búsqueda web por voluntad propia
    const webContext = needsWebSearch(content) ? await webSearch(content).catch(() => null) : null;

    // 5. Llamada a la IA
    const userPoints = guildId ? await getUserPoints(guildId, message.author.id).catch(() => 0) : 0;
    const intent = (message.attachments.size > 0 || urlText) ? 'document' : 'chat';
    
    let mediaSummary = '';
    if (memory.media && memory.media.length > 0) {
      mediaSummary = `ARCHIVOS Y ENLACES EN MEMORIA:\nEl usuario te ha compartido estos archivos previamente:\n` + memory.media.map(m => `- [${m.type}] ${m.name || 'Archivo'}: ${m.url}`).join('\n') + `\n⚠️ CRÍTICO: Si el usuario te pide que le pases, envíes o recuerdes algún archivo (PDF, imagen, video, etc) o enlace que tengas guardado, DEBES enviarle directamente la URL correspondiente en tu respuesta para que Discord lo muestre.`;
    }
    
    const conversationSummary = [summaryForAI, summary, mediaSummary].filter(Boolean).join('\n\n');
    let response;
    if (memoryIntent?.isRecall && rememberedFacts.length === 0) {
      const errStatus = formatMemoryErrorStatus('insufficient');
      if (thinkingState) thinkingState.memoryStatusLine = errStatus;
      const callerName = isOwner(message.author) ? 'larita' : (message.member?.displayName || message.author.username);
      response = {
        text: `Neta ${callerName}, estuve revisando toda mi memoria global y no tengo datos u hechos guardados de otros servidores todavía.`,
        provider: 'MemoryEngine',
        model: 'DirectRecall'
      };
    } else if (memoryIntent?.isRecall && rememberedFacts.length > 0 && /qu[eé]\s+(recuerdas|sabes|tienes|guardaste)/i.test(content)) {
      const formattedFactsList = rememberedFacts.map(f => `• ${f}`).join('\n');
      response = {
        text: `Neta! De mi memoria global y de lo que me has dicho tengo bien guardado:\n${formattedFactsList}`,
        provider: 'MemoryEngine',
        model: 'DirectRecall'
      };
    } else {
      response = await askAI(llmHistory, recentTokens, {
        moodInfo,
        intent,
        isOwner: context.isOwnerMessage,
        isSubCreator: isSubCreator(message.author),
        memorySummary: conversationSummary,
        isGlobal: memory.isGlobal,
        userProfile: formatProfileForPrompt(userConfig.profile),
        webContext,
        guild: message.guild,
        channelName: message.channel?.name,
        swearingAllowed: flags.swearing,
        respectfulOnly: flags.respectfulOnly,
        securityMode: flags.securityMode,
        botPersonality: flags.botPersonality || 'asistente',
        userPoints,
      });
    }

    lastAIResponse = { provider: response.provider, model: response.model };

    memory.messages.push({
      role: 'assistant',
      content: response.text,
      authorName: client.user.username,
      createdAt: new Date().toISOString(),
    });

    // La respuesta no se envia hasta que el guardado de memoria del turno termina.
    let triggerGhostMemory = false;
    try {
      const result = await saveUserMemory(message.author.id, guildId, userConfig.mode, memory, channelId);

      // Memoria automática compacta: solo aparece si hubo compactación real y nadie la pidió.
      if (result?.summarized && !memoryIntent.isExplicit) {
        triggerGhostMemory = true;
      }
    } catch (err) {
      console.error('[memory] Error guardando memoria:', err.message);
    }

    if (guildId) config.addTokenUsage(guildId, response.tokens || estimateTokens(response.text));

    // 7. Delay humano dinamico
    let thinkingMs = computeThinkingDelay({
      responseText: response.text,
      moodInfo,
      incomingLength: content.length,
    });
    
    // Respuestas Rápidas para Mensajes Cortitos
    const isShortMessage = content.trim().length <= 12 || content.split(/\\s+/).length <= 3;
    if (isShortMessage) {
      thinkingMs = 150; // Delay corto de 150ms
    }
    await humanizedTyping(message.channel, thinkingMs);

    // ═══════════════════════════════════════════════════════
    // 💡 Detener "Pensando" → Editar mensaje con la respuesta
    // ═══════════════════════════════════════════════════════
    if (thinkingInterval) clearInterval(thinkingInterval);
    const thinkingTime = formatThinkingTime(Date.now() - thinkingStart);

    let pingPrefix = '';
    if (thinkingMsg && message.channel.lastMessageId !== thinkingMsg.id) {
      pingPrefix = `<@${message.author.id}> `;
    }

    // 8. Sanitizar respuesta vacía o con solo '...' y reemplazar emojis unicode por los del servidor
    let cleanText = (response.text || '').trim();
    if (!cleanText || cleanText === '...' || cleanText === '..' || cleanText === '.') {
      cleanText = 'jaja qué pedo, qué me decías?';
    }
    cleanText = replaceUnicodeWithServerEmojis(cleanText, message.guild);

    // 9. Fragmentar la respuesta como escribe una persona real
    const parts = splitHumanized(cleanText, moodInfo);
    let firstMessageEdited = false;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const chunks = part.match(/[\s\S]{1,1900}/g) || ['...'];
      
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        
        if (!firstMessageEdited && thinkingMsg) {
          const fullContent = `${pingPrefix}${chunk}`;
          if (thinkingState) thinkingState.aiResponseText = fullContent;
          const thinkingLine = `-# ${EMOJIS.thinking} *Pensó por ${thinkingTime}*`;
          let footerStr = thinkingLine;
          if (thinkingState?.memoryStatusLine) {
            footerStr = `${thinkingLine}\n${thinkingState.memoryStatusLine}`;
          }
          await thinkingMsg.edit(`${fullContent}\n${footerStr}`).catch(() => null);
          firstMessageEdited = true;

          // Tras 3 minutos (180,000 ms = 3 min), remueve "Memoria actualizada" dejando solo "Pensó por..."
          if (thinkingState?.memoryStatusLine) {
            setTimeout(async () => {
              try {
                if (thinkingMsg) {
                  await thinkingMsg.edit(`${fullContent}\n${thinkingLine}`).catch(() => null);
                }
              } catch { /* ignore */ }
            }, 180000);
          }
        } else {
          await message.channel.send(chunk);
        }
      }
      
      if (i < parts.length - 1) {
        await new Promise(r => setTimeout(r, delayBetweenParts()));
        await message.channel.sendTyping().catch(() => {});
      }
    }

    // Ghost effect for implicit memory
    if (triggerGhostMemory && thinkingMsg && firstMessageEdited) {
      (async () => {
        try {
          // Extraemos el prefijo de la última chunk (sin el "Pensó por")
          const lastChunk = parts[parts.length - 1].match(/[\s\S]{1,1900}/g)?.pop() || '...';
          const baseText = `${pingPrefix}${lastChunk}`;
          
          await sleep(1500);
          // 1. Muta a Managing memory
          await thinkingMsg.edit(`${baseText}\n-# ${EMOJIS.memory} *Managing memory...*`).catch(()=>null);
          await sleep(2000);
          // 2. Muta a paso compacto
          await thinkingMsg.edit(`${baseText}\n-# ↳ guardando historial...`).catch(()=>null);
          await sleep(3500);
          // 3. Muta a completado
          await thinkingMsg.edit(`${baseText}\n-# ${EMOJIS.done} *Memoria actualizada*`).catch(()=>null);
          
          // 4. Espera 1 minuto
          await sleep(60000);
          // 5. Regresa a Pensó por original
          await thinkingMsg.edit(`${baseText}\n-# ${EMOJIS.thinking} *Pensó por ${thinkingTime}*`).catch(()=>null);
        } catch(e) {}
      })();
    }

    config.updateBotStatus(client, lastAIResponse);
  } catch (err) {
    console.error('[error] Fallo completo de IA:', err.message);
    if (thinkingInterval) clearInterval(thinkingInterval);
    if (thinkingState) thinkingState.stop();

    const muletilla = pickMuletilla(channelId);
    const isMemoryOp = memoryIntent?.isExplicit || memoryIntent?.isSave || memoryIntent?.isRecall;

    let errText = `${muletilla}, ando al límite de capacidad con la IA ahora mismo, intenta en un ratito, sale?`;
    if (isMemoryOp) {
      errText = `${muletilla}, mi memoria ahorita anda al límite de espacio disponible o en pausa temporal. Prueba a guardar de nuevo en un ratito, sale?`;
    }

    if (thinkingMsg) {
      await thinkingMsg.edit(errText).catch(() => message.reply(errText).catch(() => null));
    } else {
      await message.reply(errText).catch(() => null);
    }
  } finally {
    activeUserProcesses.delete(message.author.id);
  }
});

const token = secrets.getDiscordToken();
if (!token) { console.error('[fatal] DISCORD_TOKEN no configurado.'); process.exit(1); }
client.login(token);
