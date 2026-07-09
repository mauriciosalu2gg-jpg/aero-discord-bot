import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { db } from './database/firebase.js';
import secrets from './secrets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUILDS_FILE = path.join(__dirname, 'data', 'guilds.json');

// --- Métodos locales de Fallback ---
function loadGuildsLocal() {
  try {
    const raw = fs.readFileSync(GUILDS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveGuildsLocal(guilds) {
  fs.mkdirSync(path.dirname(GUILDS_FILE), { recursive: true });
  fs.writeFileSync(GUILDS_FILE, JSON.stringify(guilds, null, 2), 'utf-8');
}

// --- Métodos Públicos con Firestore Sync ---

/**
 * Registra un servidor de Discord en Firestore (o localmente si Firestore está desconectado).
 */
export async function registerGuild(guild) {
  const guildData = {
    name: guild.name,
    addedAt: new Date().toISOString(),
    tokensUsedTotal: 0
  };

  if (db) {
    try {
      const docRef = db.collection('guilds').doc(guild.id);
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set(guildData);
        console.log(`[config/Firestore] Servidor registrado: ${guild.name} (${guild.id})`);
      }
      return { id: guild.id, ...(doc.exists ? doc.data() : guildData) };
    } catch (err) {
      console.error('[config/Firestore] Error al registrar servidor:', err);
    }
  }

  // Fallback Local
  const guilds = loadGuildsLocal();
  if (!guilds[guild.id]) {
    guilds[guild.id] = guildData;
    saveGuildsLocal(guilds);
    console.log(`[config/Local] Servidor registrado: ${guild.name} (${guild.id})`);
  }
  return guilds[guild.id];
}

/**
 * Suma tokens usados por servidor en Firestore (o localmente).
 */
export async function addTokenUsage(guildId, tokens) {
  if (db) {
    try {
      await db.collection('guilds').doc(guildId).update({
        tokensUsedTotal: admin.firestore.FieldValue.increment(tokens)
      });
      return;
    } catch (err) {
      console.error('[config/Firestore] Error al sumar tokens:', err);
    }
  }

  // Fallback Local
  const guilds = loadGuildsLocal();
  if (guilds[guildId]) {
    guilds[guildId].tokensUsedTotal = (guilds[guildId].tokensUsedTotal || 0) + tokens;
    saveGuildsLocal(guilds);
  }
}

/**
 * Actualiza el estado del bot en tiempo real en Firestore.
 * Esto alimenta la tarjeta de estado del panel web.
 */
export async function updateBotStatus(client, activeModelInfo = {}) {
  if (!db) return;

  const uptime = process.uptime(); // en segundos
  const latency = client.ws.ping; // ms
  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
  const cpuUsage = process.cpuUsage(); // cpu usage object

  const statusData = {
    botTag: client.user.tag,
    botId: client.user.id,
    uptimeSeconds: Math.floor(uptime),
    latencyMs: latency,
    memoryUsageMb: Math.round(memoryUsage),
    activeAIProvider: activeModelInfo.provider || 'gemini',
    activeAIModel: activeModelInfo.model || 'gemini-2.0-flash',
    lastSync: new Date().toISOString(),
    status: 'online'
  };

  try {
    await db.collection('bot').doc('status').set(statusData, { merge: true });
  } catch (err) {
    console.error('[config/Firestore] Error al actualizar estado del bot:', err);
  }
}

export default {
  registerGuild,
  addTokenUsage,
  updateBotStatus,
  detectProvider: secrets.getActiveProvider,
};
