import { getCached, setCached, deleteCached } from '../cache/firebaseCache.js';
import { summarizeMemoryHistory } from '../summary/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionsBitField, ChannelType } from 'discord.js';
import { db } from '../../database/firebase.js';

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

  // Guardar tambien a nivel global
  const globalPath = 'global/stats/tokens';
  const globalData = await getCached(globalPath, { total: 0 });
  globalData.total = (globalData.total || 0) + tokens;
  globalData.updatedAt = new Date().toISOString();
  setCached(globalPath, globalData);
}

export async function getGlobalTokenUsage() {
  const data = await getCached('global/stats/tokens', { total: 0 });
  return data.total || 0;
}

export async function registerGuildLocal(guild) {
  const docPath = `guilds/${guild.id}`;
  const data = await getCached(docPath, null);
  
  const newData = { 
    name: guild.name,
    icon: guild.iconURL() || null,
    memberCount: guild.memberCount || 0,
    updatedAt: new Date().toISOString()
  };

  if (!data) {
    newData.addedAt = new Date().toISOString();
  } else {
    newData.addedAt = data.addedAt || new Date().toISOString();
  }
  
  setCached(docPath, newData);
  console.log(`[memory] Servidor registrado/actualizado: ${guild.name} (${guild.id})`);
  
  // Sincronizar canales en background
  syncGuildChannels(guild).catch(err => console.error('[memory] Error sincronizando canales:', err));
  
  return { id: guild.id, ...newData };
}

export async function syncGuildChannels(guild) {
  if (!db) return;
  const botMember = guild.members.me;
  if (!botMember) return;

  const validChannels = guild.channels.cache.filter(c => {
    if (c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildAnnouncement) return false;
    const perms = botMember.permissionsIn(c);
    return perms.has(PermissionsBitField.Flags.ViewChannel) && perms.has(PermissionsBitField.Flags.SendMessages);
  });

  const batch = db.batch();
  let count = 0;
  
  for (const [channelId, channel] of validChannels) {
    const docRef = db.collection('guilds').doc(guild.id).collection('channels').doc(channelId);
    batch.set(docRef, {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.rawPosition,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    count++;
    
    if (count >= 400) {
      await batch.commit().catch(e => console.error('[memory] Error en batch commit de canales:', e.message));
      count = 0;
      batch = db.batch();
    }
  }

  try {
    const existingDocs = await db.collection('guilds').doc(guild.id).collection('channels').get();
    existingDocs.forEach(doc => {
      if (!validChannels.has(doc.id)) {
        batch.delete(doc.ref);
        count++;
      }
    });
  } catch (err) {
    console.warn('[memory] No se pudieron limpiar canales antiguos:', err.message);
  }

  if (count > 0) {
    await batch.commit().catch(e => console.error('[memory] Error finalizando batch de canales:', e.message));
  }
}

export default {
  getUserMemory,
  saveUserMemory,
  resetUserMemory,
  getGuildTokenUsage,
  getGlobalTokenUsage,
  addGuildTokenUsage,
  registerGuildLocal,
  syncGuildChannels,
};
