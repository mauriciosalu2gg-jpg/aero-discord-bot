// config.js
// Wrapper fino sobre core/memory.js (Firestore) + estado en vivo del bot
// para el panel web (bot/status), igual que la version original.
import admin from 'firebase-admin';
import { db } from './database/firebase.js';
import { registerGuildLocal, addGuildTokenUsage, getGuildTokenUsage, syncGuildChannels } from './core/memory/index.js';
import secrets from './secrets.js';

export async function registerGuild(guild) {
  return registerGuildLocal(guild);
}

export async function syncChannels(guild) {
  return syncGuildChannels(guild);
}

export async function addTokenUsage(guildId, tokens) {
  await addGuildTokenUsage(guildId, tokens);
}

export async function getTokenUsage(guildId) {
  return getGuildTokenUsage(guildId);
}

/**
 * Actualiza el estado del bot en tiempo real en Firestore (bot/status),
 * para el panel web. Si no hay Firestore disponible, no hace nada.
 */
export async function updateBotStatus(client, activeModelInfo = {}) {
  if (!db) return;

  const uptime = process.uptime();
  const latency = client.ws.ping;
  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

  const statusData = {
    botTag: client.user.tag,
    botId: client.user.id,
    uptimeSeconds: Math.floor(uptime),
    latencyMs: latency,
    memoryUsageMb: Math.round(memoryUsage),
    activeAIProvider: activeModelInfo.provider || 'gemini',
    activeAIModel: activeModelInfo.model || 'gemini-2.0-flash',
    lastSync: new Date().toISOString(),
    status: 'online',
  };

  try {
    await db.collection('bot').doc('status').set(statusData, { merge: true });
  } catch (err) {
    console.error('[config/Firestore] Error al actualizar estado del bot:', err.message);
  }
}

export default {
  registerGuild,
  syncChannels,
  addTokenUsage,
  updateBotStatus,
  getTokenUsage,
  detectProvider: secrets.getActiveProvider,
};
