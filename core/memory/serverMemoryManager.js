import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../database/firebase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVERS_DIR = path.join(__dirname, '..', '..', 'data', 'servers');

function ensureServersDir() {
  if (!fs.existsSync(SERVERS_DIR)) {
    fs.mkdirSync(SERVERS_DIR, { recursive: true });
  }
}

export function getServerMemoryPath(guildId) {
  ensureServersDir();
  return path.join(SERVERS_DIR, `guild_${guildId}_memory.json`);
}

/**
 * Inicializa automáticamente el archivo JSON singular y el scope Firebase para un nuevo servidor.
 */
export async function initServerMemory(guildId, guildName = 'Servidor') {
  ensureServersDir();
  const filePath = getServerMemoryPath(guildId);

  const initialData = {
    serverId: guildId,
    name: guildName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    facts: [],
    conversations: {},
    users: {}
  };

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2), 'utf8');
    console.log(`[serverMemory] Creado JSON singular de memoria para servidor ${guildName} (${guildId}).`);
  }

  if (db) {
    try {
      await db.collection('memoryScopes').doc(guildId).set({
        serverId: guildId,
        name: guildName,
        active: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log(`[serverMemory] Firebase scope inicializado para ${guildId}.`);
    } catch (err) {
      console.warn(`[serverMemory] No se pudo crear Firebase scope para ${guildId}:`, err.message);
    }
  }

  return initialData;
}

/**
 * Borra automáticamente el JSON de memoria local y el scope en Firebase cuando el bot sale de un servidor.
 */
export async function deleteServerMemory(guildId) {
  const filePath = getServerMemoryPath(guildId);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`[serverMemory] Borrado JSON de memoria local del servidor ${guildId}.`);
    } catch (err) {
      console.warn(`[serverMemory] Error al borrar JSON del servidor ${guildId}:`, err.message);
    }
  }

  if (db) {
    try {
      await db.collection('memoryScopes').doc(guildId).delete();
      console.log(`[serverMemory] Borrado Firebase scope del servidor ${guildId}.`);
    } catch (err) {
      console.warn(`[serverMemory] Error al borrar Firebase scope de ${guildId}:`, err.message);
    }
  }
}

/**
 * Lee la memoria singular de un servidor.
 */
export function readServerMemory(guildId) {
  const filePath = getServerMemoryPath(guildId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Guarda o actualiza la memoria singular de un servidor.
 */
export async function saveServerMemory(guildId, data) {
  const filePath = getServerMemoryPath(guildId);
  data.updatedAt = new Date().toISOString();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[serverMemory] Error guardando JSON del servidor ${guildId}:`, err.message);
  }

  if (db) {
    try {
      await db.collection('memoryScopes').doc(guildId).set(data, { merge: true });
    } catch { /* ignore */ }
  }
}

/**
 * Agrega todos los hechos y resúmenes de TODOS los archivos JSON singulares de servidor.
 */
export function getAllServersMemory() {
  ensureServersDir();
  const files = fs.readdirSync(SERVERS_DIR).filter(f => f.startsWith('guild_') && f.endsWith('_memory.json'));
  const allMemories = [];

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(SERVERS_DIR, file), 'utf8'));
      if (content && content.serverId) {
        allMemories.push(content);
      }
    } catch { /* ignore */ }
  }

  return allMemories;
}

export default {
  initServerMemory,
  deleteServerMemory,
  readServerMemory,
  saveServerMemory,
  getAllServersMemory,
  getServerMemoryPath,
};
