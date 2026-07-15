import { getCached, setCached, deleteCached } from '../cache/firebaseCache.js';
import { summarizeMemoryHistory } from '../summary/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FALLBACK_DIR = path.join(__dirname, '..', '..', 'data', 'stats'); // Solo para fallback de stats/guilds si hace falta

// ── Memoria de Chat por Usuario (Cacheada en RAM -> Firebase) ──────────

export async function getUserMemory(userId, guildId, mode) {
  if (mode === 'off') return { messages: [], summary: '', facts: [] };
  
  const messagesPath = `guilds/${guildId}/users/${userId}/messages`;
  const factsPath = mode === 'global' ? `global/users/${userId}/facts` : `guilds/${guildId}/users/${userId}/facts`;

  const messagesData = await getCached(messagesPath, { messages: [] });
  const factsData = await getCached(factsPath, { facts: [], summary: '' });

  return { 
    messages: messagesData.messages || [],
    facts: factsData.facts || [],
    summary: factsData.summary || ''
  };
}

export async function saveUserMemory(userId, guildId, mode, memoryData) {
  if (mode === 'off') return;

  const messagesPath = `guilds/${guildId}/users/${userId}/messages`;
  const factsPath = mode === 'global' ? `global/users/${userId}/facts` : `guilds/${guildId}/users/${userId}/facts`;

  // Auto-resumen si llega al limite (ej. 40 mensajes)
  if (memoryData.messages && memoryData.messages.length > 40) {
    const summarized = await summarizeMemoryHistory(memoryData);
    memoryData = summarized;
  }
  
  setCached(messagesPath, { messages: memoryData.messages, updatedAt: new Date().toISOString() });
  setCached(factsPath, { facts: memoryData.facts, summary: memoryData.summary, updatedAt: new Date().toISOString() });
}

export async function resetUserMemory(userId, guildId, mode) {
  if (mode === 'off') return { messages: [], summary: '', facts: [] };
  
  const messagesPath = `guilds/${guildId}/users/${userId}/messages`;
  setCached(messagesPath, { messages: [], updatedAt: new Date().toISOString() });
  
  // Borramos los facts del nivel correspondiente al modo actual
  const factsPath = mode === 'global' ? `global/users/${userId}/facts` : `guilds/${guildId}/users/${userId}/facts`;
  setCached(factsPath, { facts: [], summary: '', updatedAt: new Date().toISOString() });
  
  return { messages: [], summary: '', facts: [] };
}

// ── Estadisticas y Tokens (Mantenemos la logica anterior pero con Cache) ─

export async function getGuildTokenUsage(guildId) {
  const docPath = `guilds/${guildId || '_dm'}/stats/tokens`;
  const data = await getCached(docPath, { total: 0 });
  return data.total || 0;
}

export async function addGuildTokenUsage(guildId, tokens) {
  if (!guildId || !tokens) return;
  const docPath = `guilds/${guildId}/stats/tokens`;
  const data = await getCached(docPath, { total: 0 });
  data.total = (data.total || 0) + tokens;
  data.updatedAt = new Date().toISOString();
  setCached(docPath, data);
}

export async function registerGuildLocal(guild) {
  const docPath = `guilds/${guild.id}`;
  const data = await getCached(docPath, null);
  if (!data) {
    const newData = { name: guild.name, addedAt: new Date().toISOString() };
    setCached(docPath, newData);
    console.log(`[memory] Servidor registrado: ${guild.name} (${guild.id})`);
    return { id: guild.id, ...newData };
  }
  return { id: guild.id, ...data };
}

export default {
  getUserMemory,
  saveUserMemory,
  resetUserMemory,
  getGuildTokenUsage,
  addGuildTokenUsage,
  registerGuildLocal,
};
