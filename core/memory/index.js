import { getCached, setCached, flushCached, deleteCached } from '../cache/firebaseCache.js';
import { summarizeMemoryHistory, detectTopicChange } from '../summary/index.js';
import { isMemoryEngineAvailable } from '../../services/ai/memoryRouter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionsBitField, ChannelType } from 'discord.js';
import { db } from '../../database/firebase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FALLBACK_DIR = path.join(__dirname, '..', '..', 'data', 'stats');

// ── Rutas Firebase (SIEMPRE con número par de segmentos) ────────────────

function memoryScope(guildId, mode) {
  return mode === 'global' ? 'global' : (guildId || 'direct');
}

// Rutas legacy (compatibilidad hacia atrás)
function legacyConversationPath(userId, guildId, mode, channelId) {
  const scope = memoryScope(guildId, mode);
  return `memoryScopes/${scope}/conversations/${channelId || 'direct'}/users/${userId}`;
}
function legacyFactsPath(userId, guildId, mode) {
  return `memoryScopes/${memoryScope(guildId, mode)}/facts/${userId}`;
}

// Rutas nuevas: perfil separado de temas (2 segmentos = válido Firebase)
function profilePath(userId) {
  return `user_profiles/${userId}`;
}
function topicsPath(userId) {
  return `user_topics/${userId}`;
}
function topicStatePath(userId, guildId) {
  return `user_topic_state/${userId}_${guildId || 'direct'}`;
}

// ── Memoria de Chat por Usuario ─────────────────────────────────────────

export async function getUserMemory(userId, guildId, mode, channelId) {
  if (mode === 'off') return { messages: [], summary: '', facts: [] };

  const msgPath = legacyConversationPath(userId, guildId, mode, channelId);
  const fPath = legacyFactsPath(userId, guildId, mode);
  let messagesData = await getCached(msgPath, null);
  let factsData = await getCached(fPath, null);

  // Migración silenciosa desde esquema más antiguo
  if (!messagesData) {
    const oldPath = `guilds/${guildId || 'direct'}/users/${userId}_messages`;
    messagesData = await getCached(oldPath, { messages: [] });
  }
  if (!factsData) {
    const oldPath = mode === 'global'
      ? `global/data/users/${userId}_facts`
      : `guilds/${guildId || 'direct'}/users/${userId}_facts`;
    factsData = await getCached(oldPath, { facts: [], summary: '' });
  }

  // Enriquecer con perfil persistente si existe
  let profileFacts = [];
  try {
    const profile = await getCached(profilePath(userId), null);
    if (profile && profile.facts && profile.facts.length > 0) {
      profileFacts = profile.facts;
    }
  } catch { /* sin perfil aún */ }

  // Mergear: perfil persistente + facts de conversación (sin duplicados)
  const conversationFacts = factsData.facts || [];
  const allFacts = [...profileFacts];
  for (const f of conversationFacts) {
    if (!allFacts.some(pf => pf.toLowerCase() === f.toLowerCase())) {
      allFacts.push(f);
    }
  }

  return {
    messages: messagesData.messages || [],
    facts: allFacts,
    summary: factsData.summary || '',
  };
}

export async function saveUserMemory(userId, guildId, mode, memoryData, channelId) {
  if (mode === 'off') return { summarized: false };

  const msgPath = legacyConversationPath(userId, guildId, mode, channelId);
  const fPath = legacyFactsPath(userId, guildId, mode);

  let summarized = false;
  let topicClosed = null;

  // ── Memory Engine: Detección inteligente de temas ─────────────────
  if (isMemoryEngineAvailable() && memoryData.messages && memoryData.messages.length > 20) {
    try {
      // Cargar estado del tema activo
      const stateKey = topicStatePath(userId, guildId);
      const topicState = await getCached(stateKey, { currentTopic: '', topicCount: 0 });

      // Detectar si cambió el tema
      const detection = await detectTopicChange(
        memoryData.messages.slice(-6),
        topicState.currentTopic
      );

      if (detection.changed && memoryData.messages.length > 25) {
        // El tema cambió → cerrar el tema anterior y compactar
        const result = await summarizeMemoryHistory(memoryData, topicState);
        memoryData = result;
        summarized = true;

        // Guardar el topic cerrado en Firebase
        if (result._topicClosed) {
          topicClosed = result._topicClosed;
          const tPath = topicsPath(userId);
          const existingTopics = await getCached(tPath, { topics: [] });
          existingTopics.topics = existingTopics.topics || [];
          existingTopics.topics.push(topicClosed);

          // Mantener solo los últimos 50 temas
          if (existingTopics.topics.length > 50) {
            existingTopics.topics = existingTopics.topics.slice(-50);
          }
          existingTopics.updatedAt = new Date().toISOString();
          setCached(tPath, existingTopics);
          flushCached(tPath).catch(e => console.error('[memory] Error flush topics:', e.message));
        }

        // Guardar profile updates separadamente
        if (result._topicClosed) {
          await saveProfileFacts(userId, memoryData.facts);
        }

        // Actualizar estado del tema
        topicState.currentTopic = detection.newTopic;
        topicState.topicCount = (topicState.topicCount || 0) + 1;
        topicState.updatedAt = new Date().toISOString();
        setCached(stateKey, topicState);
        flushCached(stateKey).catch(() => {});

        // Limpiar propiedad interna
        delete memoryData._topicClosed;
      } else {
        // Mismo tema → solo actualizar el título si es nuevo
        if (detection.newTopic && !topicState.currentTopic) {
          topicState.currentTopic = detection.newTopic;
          setCached(stateKey, topicState);
          flushCached(stateKey).catch(() => {});
        }

        // Safety: hard cap en 40 mensajes aunque el tema no haya cambiado
        if (memoryData.messages.length > 40) {
          const result = await summarizeMemoryHistory(memoryData);
          memoryData = result;
          summarized = true;
          delete memoryData._topicClosed;
        }
      }
    } catch (err) {
      console.error('[memory] Error en Memory Engine topic detection:', err.message);
      // Fallback: usar la regla legacy de 40 mensajes
      if (memoryData.messages.length > 40) {
        const result = await summarizeMemoryHistory(memoryData);
        memoryData = result;
        summarized = true;
        delete memoryData._topicClosed;
      }
    }
  } else if (memoryData.messages && memoryData.messages.length > 40) {
    // Memory Engine no disponible → usar regla legacy
    const result = await summarizeMemoryHistory(memoryData);
    memoryData = result;
    summarized = true;
    delete memoryData._topicClosed;
  }

  const updatedAt = new Date().toISOString();
  setCached(msgPath, { messages: memoryData.messages, updatedAt });
  setCached(fPath, { facts: memoryData.facts, summary: memoryData.summary, updatedAt });
  await Promise.all([flushCached(msgPath), flushCached(fPath)]);

  return { summarized, topicClosed };
}

// ── Perfil Persistente (Separado de la memoria de conversación) ─────────

async function saveProfileFacts(userId, facts) {
  if (!facts || facts.length === 0) return;
  try {
    const pPath = profilePath(userId);
    const existing = await getCached(pPath, { facts: [] });
    const merged = [...(existing.facts || [])];

    for (const fact of facts) {
      const clean = String(fact).trim();
      if (clean && !merged.some(f => f.toLowerCase() === clean.toLowerCase())) {
        merged.push(clean);
      }
    }

    // Mantener máximo 50 facts de perfil
    const trimmed = merged.slice(-50);
    setCached(pPath, { facts: trimmed, updatedAt: new Date().toISOString() });
    await flushCached(pPath);
  } catch (err) {
    console.error('[memory] Error guardando perfil:', err.message);
  }
}

// ── Recuperación Inteligente (Top N temas relevantes) ───────────────────

/**
 * Busca los temas más relevantes para una consulta dada (por keywords).
 * @param {string} userId
 * @param {string} query - El texto del último mensaje del usuario.
 * @param {number} [topN=5]
 * @returns {Promise<Array>} - Los N temas más relevantes.
 */
export async function getRelevantTopics(userId, query, topN = 5) {
  try {
    const tPath = topicsPath(userId);
    const data = await getCached(tPath, { topics: [] });
    if (!data.topics || data.topics.length === 0) return [];

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return data.topics.slice(-topN);

    // Score por coincidencia de keywords + entities + título
    const scored = data.topics.map(topic => {
      let score = 0;
      const searchable = [
        ...(topic.keywords || []),
        ...(topic.entities || []),
        topic.title || '',
      ].join(' ').toLowerCase();

      for (const word of queryWords) {
        if (searchable.includes(word)) score += 2;
      }

      // Bonus por importancia
      const importanceBonus = { CRITICAL: 4, HIGH: 3, NORMAL: 1, LOW: 0 };
      score += importanceBonus[topic.importance] || 0;

      // Bonus por recencia
      if (topic.updatedAt) {
        const ageHours = (Date.now() - new Date(topic.updatedAt).getTime()) / 3600000;
        if (ageHours < 24) score += 2;
        else if (ageHours < 168) score += 1;
      }

      return { ...topic, _score: score };
    });

    return scored
      .sort((a, b) => b._score - a._score)
      .slice(0, topN)
      .map(({ _score, ...topic }) => topic);
  } catch (err) {
    console.error('[memory] Error recuperando topics relevantes:', err.message);
    return [];
  }
}

export async function resetUserMemory(userId, guildId, mode, channelId) {
  // Solo limpia la memoria de conversación del servidor (o scope actual)
  const msgPath = legacyConversationPath(userId, guildId, mode, channelId);
  const fPath = legacyFactsPath(userId, guildId, mode);
  const updatedAt = new Date().toISOString();
  setCached(msgPath, { messages: [], updatedAt });
  setCached(fPath, { facts: [], summary: '', updatedAt });
  await Promise.all([
    flushCached(msgPath),
    flushCached(fPath),
    // Limpiar también el estado de topics del scope actual
    deleteCached(topicStatePath(userId, guildId)),
  ]);

  // NOTA: user_profiles, user_topics y user_identities son globales
  // y NO se tocan al limpiar la memoria de un servidor.
  return { messages: [], summary: '', facts: [] };
}

// ── Estadisticas y Tokens ───────────────────────────────────────────────

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

  const globalPath = 'global/data/stats/tokens';
  const globalData = await getCached(globalPath, { total: 0 });
  globalData.total = (globalData.total || 0) + tokens;
  globalData.updatedAt = new Date().toISOString();
  setCached(globalPath, globalData);
}

export async function getGlobalTokenUsage() {
  const data = await getCached('global/data/stats/tokens', { total: 0 });
  return data.total || 0;
}

export async function registerGuildLocal(guild) {
  const docPath = `guilds/${guild.id}`;
  const data = await getCached(docPath, null);

  const newData = {
    name: guild.name,
    icon: guild.iconURL() || null,
    memberCount: guild.memberCount || 0,
    updatedAt: new Date().toISOString(),
  };

  if (!data) {
    newData.addedAt = new Date().toISOString();
  } else {
    newData.addedAt = data.addedAt || new Date().toISOString();
  }

  setCached(docPath, newData);
  console.log(`[memory] Servidor registrado/actualizado: ${guild.name} (${guild.id})`);

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

  let batch = db.batch();
  let count = 0;

  for (const [channelId, channel] of validChannels) {
    const docRef = db.collection('guilds').doc(guild.id).collection('channels').doc(channelId);
    batch.set(docRef, {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.rawPosition,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    count++;

    if (count >= 400) {
      await batch.commit().catch(e => console.error('[memory] Error en batch commit:', e.message));
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
    await batch.commit().catch(e => console.error('[memory] Error finalizando batch:', e.message));
  }
}

// ── Sistema de Identidades de Usuario ────────────────────────────────────
// Guarda nombres, apodos e IDs para que el bot recuerde a las personas
// entre conversaciones aunque cambien de display name.

function identityPath(userId) {
  return `user_identities/${userId}`;
}

export async function saveUserIdentity(userId, data) {
  if (!userId) return;
  try {
    const existing = await getCached(identityPath(userId), { names: [], nicknames: [], facts: [] });
    // Merge nombres sin duplicados
    const mergedNames = [...new Set([...(existing.names || []), ...(data.names || [])])];
    const mergedNicks = [...new Set([...(existing.nicknames || []), ...(data.nicknames || [])])];
    const mergedFacts = [...(existing.facts || []), ...(data.facts || [])].slice(-30);
    const updated = {
      discordId: userId,
      names: mergedNames.slice(-10),
      nicknames: mergedNicks.slice(-20),
      facts: mergedFacts,
      updatedAt: new Date().toISOString(),
    };
    setCached(identityPath(userId), updated);
    flushCached(identityPath(userId)).catch(() => {});
    return updated;
  } catch (err) {
    console.error('[identity] Error guardando identidad:', err.message);
  }
}

export async function getUserIdentity(userId) {
  if (!userId) return null;
  try {
    return await getCached(identityPath(userId), null);
  } catch { return null; }
}

// Busca identidades por nombre o apodo (búsqueda en caché local)
export async function findIdentityByName(name, guildUserIds = []) {
  const needle = (name || '').toLowerCase().trim();
  if (!needle || needle.length < 2) return null;
  for (const uid of guildUserIds) {
    try {
      const identity = await getCached(identityPath(uid), null);
      if (!identity) continue;
      const allNames = [...(identity.names || []), ...(identity.nicknames || [])].map(n => n.toLowerCase());
      if (allNames.some(n => n.includes(needle) || needle.includes(n))) {
        return { userId: uid, identity };
      }
    } catch { continue; }
  }
  return null;
}

export default {
  getUserMemory,
  saveUserMemory,
  resetUserMemory,
  getRelevantTopics,
  getGuildTokenUsage,
  getGlobalTokenUsage,
  addGuildTokenUsage,
  registerGuildLocal,
  syncGuildChannels,
  saveUserIdentity,
  getUserIdentity,
  findIdentityByName,
};
