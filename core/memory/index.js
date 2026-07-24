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

export function archivePath(userId, guildId) {
  return `memory_archive/${userId}_${guildId || 'global'}`;
}

async function archiveOldMemory(userId, guildId, memoryData) {
  try {
    const aPath = archivePath(userId, guildId);
    const existing = await getCached(aPath, { archives: [] });
    const archive = {
      summary: memoryData.summary || '',
      facts: (memoryData.facts || []).slice(0, 30),
      messageCount: (memoryData.messages || []).length,
      archivedAt: new Date().toISOString(),
    };
    existing.archives = [...(existing.archives || []), archive].slice(-5); // max 5 archivos
    existing.updatedAt = new Date().toISOString();
    setCached(aPath, existing);
    flushCached(aPath).catch(() => {});
    console.log(`[memory] Memoria archivada para ${userId} en ${guildId || 'global'}`);
    return archive;
  } catch (err) {
    console.error('[memory] Error archivando memoria:', err.message);
    return null;
  }
}

// ── Memoria de Chat por Usuario ─────────────────────────────────────────

async function getGlobalConversationMessages(userId, currentChannelId) {
  if (!db || !userId) return [];

  try {
    const fetchPromise = (async () => {
      const conversationsSnap = await db
        .collection('memoryScopes')
        .doc('global')
        .collection('conversations')
        .get()
        .catch(() => null);

      if (!conversationsSnap || conversationsSnap.empty) return [];

      const results = await Promise.all(
        conversationsSnap.docs.map(async (channelDoc) => {
          const userDoc = await channelDoc.ref.collection('users').doc(userId).get().catch(() => null);
          if (!userDoc || !userDoc.exists) return [];
          const messages = userDoc.data()?.messages || [];
          return messages.slice(-12).map(message => ({
            ...message,
            _memoryChannelId: channelDoc.id,
            _currentChannelBoost: channelDoc.id === (currentChannelId || 'direct') ? 1 : 0,
          }));
        })
      );

      const perChannel = results.flat();
      return perChannel
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
        .slice(-60);
    })();

    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([]), 1500));
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (err) {
    console.error('[memory] Error agregando memoria global:', err.message);
    return [];
  }
}

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

  // Mergear: perfil persistente + facts de conversación + JSON singulares de servidor
  let serverFacts = [];
  try {
    const sMem = readServerMemory(guildId);
    if (sMem) {
      serverFacts = sMem.users?.[userId]?.facts || sMem.facts || [];
    }
  } catch { /* ignore */ }

  const conversationFacts = factsData.facts || [];
  const allFacts = [...profileFacts];
  for (const f of [...conversationFacts, ...serverFacts]) {
    if (!allFacts.some(pf => pf.toLowerCase() === f.toLowerCase())) {
      allFacts.push(f);
    }
  }

  let media = [];
  try {
    const mediaData = await getCached(mediaPath(userId), { media: [] });
    media = mediaData.media || [];
  } catch { /* ignore */ }

  let topics = [];
  if (mode === 'global') {
    try {
      const tPath = topicsPath(userId);
      const data = await getCached(tPath, { topics: [] });
      topics = data.topics || [];
    } catch { /* sin topics aún */ }
  }

  let messages = messagesData.messages || [];
  if (mode === 'global') {
    const globalMessages = await getGlobalConversationMessages(userId, channelId);
    if (globalMessages.length > 0) {
      const seen = new Set();
      messages = [...globalMessages, ...messages]
        .filter(m => {
          const key = `${m.role}|${m.createdAt || ''}|${String(m.content || '').slice(0, 120)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
        .slice(-80);
    }
  }

  let crossServerSummary = '';
  if (mode === 'global') {
    try {
      const serverMemories = await getAllUserServerMemories(userId);
      if (serverMemories.length > 0) {
        const otherServersText = serverMemories.map(s => {
          const sLabel = s.serverId === 'global' ? 'Global' : (s.serverId === guildId ? `Este servidor (${s.serverId})` : `Servidor ID ${s.serverId}`);
          const factsStr = (s.facts || []).join('; ');
          return `- [${sLabel}]: Resumen de charlas: "${s.summary || 'Conversación general'}" | Hechos conocidos: ${factsStr || 'Ninguno'}`;
        }).join('\n');

        if (otherServersText) {
          crossServerSummary = `## RESUMEN HISTÓRICO DE OTROS SERVIDORES (MODO GLOBAL ACTIVO):\n${otherServersText}`;
        }
      }
    } catch { /* ignore */ }
  }

  const finalSummary = [factsData.summary || '', crossServerSummary].filter(Boolean).join('\n\n');

  return {
    messages,
    facts: allFacts,
    media,
    summary: finalSummary,
    isGlobal: mode === 'global',
    ...(mode === 'global' ? { topics } : {})
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
          await archiveOldMemory(userId, guildId, memoryData);
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
        await archiveOldMemory(userId, guildId, memoryData);
        const result = await summarizeMemoryHistory(memoryData);
        memoryData = result;
        summarized = true;
        delete memoryData._topicClosed;
      }
    }
  } else if (memoryData.messages && memoryData.messages.length > 40) {
    // Memory Engine no disponible → usar regla legacy
    await archiveOldMemory(userId, guildId, memoryData);
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
    const cachedDoc = await getCached(pPath, null);
    const existing = cachedDoc || { facts: [] };
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

import { getAllServersMemory, readServerMemory, saveServerMemory } from './serverMemoryManager.js';

export async function getAllUserServerMemories(userId) {
  const localServerMemories = getAllServersMemory();
  const aggregated = [];

  for (const sMem of localServerMemories) {
    const userFacts = sMem.users?.[userId]?.facts || sMem.facts || [];
    const userSummary = sMem.users?.[userId]?.summary || sMem.summary || '';
    if (userFacts.length > 0 || userSummary) {
      aggregated.push({
        serverId: sMem.serverId,
        serverName: sMem.name || 'Servidor',
        summary: userSummary,
        facts: userFacts,
        updatedAt: sMem.updatedAt || ''
      });
    }
  }

  if (!db || !userId) return aggregated;

  try {
    const fetchPromise = (async () => {
      const scopesSnap = await db.collection('memoryScopes').get().catch(() => null);
      if (!scopesSnap || scopesSnap.empty) return aggregated;
      
      const results = await Promise.all(
        scopesSnap.docs.map(async (scopeDoc) => {
          const factsDoc = await scopeDoc.ref.collection('facts').doc(userId).get().catch(() => null);
          if (factsDoc && factsDoc.exists) {
            const data = factsDoc.data();
            if (data.summary || (data.facts && data.facts.length > 0)) {
              return {
                serverId: scopeDoc.id,
                summary: data.summary || '',
                facts: data.facts || [],
                updatedAt: data.updatedAt || ''
              };
            }
          }
          return null;
        })
      );
      const cloudMemories = results.filter(Boolean);
      const map = new Map();
      for (const m of [...aggregated, ...cloudMemories]) {
        map.set(m.serverId, m);
      }
      return Array.from(map.values());
    })();

    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(aggregated), 6000));
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (err) {
    console.error('[memory] Error en getAllUserServerMemories:', err.message);
    return aggregated;
  }
}

export async function resetUserMemory(userId, guildId, mode, channelId) {
  return await purgeUserMemory(userId, guildId, mode, channelId);
}

export async function purgeUserMemory(userId, guildId, mode, channelId, targetServerArg = null) {
  let targetScope = memoryScope(guildId, mode);
  
  if (targetServerArg) {
    const cleanArg = targetServerArg.trim().toLowerCase();
    if (cleanArg === 'global') {
      targetScope = 'global';
    } else if (cleanArg === 'este') {
      targetScope = guildId || 'direct';
    } else if (cleanArg !== 'todos') {
      targetScope = targetServerArg.trim();
    }
  }

  const isWipeAll = targetServerArg && targetServerArg.trim().toLowerCase() === 'todos';
  const scopesToClear = isWipeAll 
    ? ['global', guildId || 'direct'] 
    : [targetScope];

  for (const scope of scopesToClear) {
    if (!scope) continue;
    const msgPath = legacyConversationPath(userId, scope, 'local', channelId);
    const fPath = legacyFactsPath(userId, scope, 'local');
    const globalMsgPath = legacyConversationPath(userId, scope, 'global', channelId);
    const globalFPath = legacyFactsPath(userId, scope, 'global');
    const updatedAt = new Date().toISOString();

    setCached(msgPath, { messages: [], updatedAt });
    setCached(fPath, { facts: [], summary: '', updatedAt });
    setCached(globalMsgPath, { messages: [], updatedAt });
    setCached(globalFPath, { facts: [], summary: '', updatedAt });

    deleteCached(topicStatePath(userId, scope));
    deleteCached(archivePath(userId, scope));

    await Promise.all([
      flushCached(msgPath),
      flushCached(fPath),
      flushCached(globalMsgPath),
      flushCached(globalFPath),
    ]);

    if (db) {
      try {
        await db.collection('memoryScopes').doc(scope).collection('conversations').doc(channelId || 'direct').collection('users').doc(userId).delete().catch(() => {});
        await db.collection('memoryScopes').doc(scope).collection('facts').doc(userId).delete().catch(() => {});
        await db.collection('user_topic_state').doc(`${userId}_${scope}`).delete().catch(() => {});
        await db.collection('memory_archive').doc(`${userId}_${scope}`).delete().catch(() => {});
      } catch (err) {
        console.warn(`[memory/purge] Error borrando doc Firestore en scope ${scope}:`, err.message);
      }
    }
  }

  if (isWipeAll || targetScope === 'global') {
    const pPath = profilePath(userId);
    const tPath = topicsPath(userId);
    const mPath = mediaPath(userId);

    deleteCached(pPath);
    deleteCached(tPath);
    deleteCached(mPath);

    if (db) {
      try {
        await db.collection('user_profiles').doc(userId).delete().catch(() => {});
        await db.collection('user_topics').doc(userId).delete().catch(() => {});
        await db.collection('user_media').doc(userId).delete().catch(() => {});
      } catch {}
    }
  }

  return { purged: true, targetScope };
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

// ── Referencias de Media en Memoria ────────────────────────────────────
// Guarda referencias de PDFs, imágenes y links que el usuario comparte.
// Los links maliciosos se filtran antes de guardar.

// Lista de dominios/patrones sospechosos (blacklist básica)
const MALICIOUS_PATTERNS = [
  /bit\.ly\/[a-z0-9]+/i,
  /tinyurl\.com/i,
  /grabify\.link/i,
  /iplogger\./i,
  /discord\.gift(?!s\.)/i, // discord.gift falso (no discord.gifts oficial)
  /free-nitro\./i,
  /steamcommunity\.com\/tradeoffer\/new\//i,
  /phishing/i,
];

export function isMaliciousLink(url) {
  if (!url || typeof url !== 'string') return false;
  return MALICIOUS_PATTERNS.some(pattern => pattern.test(url));
}

function mediaPath(userId) {
  return `user_media/${userId}`;
}

export async function saveMediaReference(userId, mediaItem) {
  // mediaItem: { type: 'image'|'pdf'|'link', url, name, description, savedAt }
  if (!userId || !mediaItem?.url) return;
  if (isMaliciousLink(mediaItem.url)) {
    console.warn(`[memory] Link malicioso bloqueado para ${userId}: ${mediaItem.url}`);
    return { blocked: true };
  }
  try {
    const mPath = mediaPath(userId);
    const existing = await getCached(mPath, { media: [] });
    existing.media = [
      ...(existing.media || []),
      { ...mediaItem, savedAt: new Date().toISOString() }
    ].slice(-50); // max 50 referencias
    existing.updatedAt = new Date().toISOString();
    setCached(mPath, existing);
    flushCached(mPath).catch(() => {});
    return { saved: true };
  } catch (err) {
    console.error('[memory] Error guardando media:', err.message);
  }
}

export async function getUserMedia(userId) {
  if (!userId) return [];
  try {
    const data = await getCached(mediaPath(userId), { media: [] });
    return data.media || [];
  } catch { return []; }
}

// ── Sistema de Identidades de Usuario ────────────────────────────────────
// Guarda nombres, apodos e IDs para que el bot recuerde a las personas
// entre conversaciones aunque cambien de display name.

function identityPath(userId) {
  return `user_identities/${userId}`;
}

export async function saveUserIdentity(userId, data = {}) {
  if (!userId) return null;
  try {
    const cachedDoc = await getCached(identityPath(userId), null);
    const existing = cachedDoc || { names: [], nicknames: [], facts: [] };
    // Los nombres actuales REEMPLAZAN a los anteriores (para reflejar cambios de username)
    // Los nicknames se acumulan (son apodos que la gente le da)
    const mergedNicks = [...new Set([...(existing.nicknames || []), ...(data.nicknames || [])])];
    
    // Añadir hechos asegurando no duplicados
    const newFacts = (data.facts || []).filter(nf => 
      !(existing.facts || []).some(ef => ef.toLowerCase() === nf.toLowerCase())
    );
    const mergedFacts = [...(existing.facts || []), ...newFacts].slice(-30);
    const updated = {
      discordId: userId,
      names: (data.names || []).filter(Boolean).length
        ? (data.names || []).filter(Boolean).slice(-5)
        : (existing.names || []).slice(-5),
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

// Busca identidades por nombre, apodo o ID (búsqueda en caché local)
export async function findIdentityByName(name, guildUserIds = []) {
  const needle = (name || '').toLowerCase().trim();
  if (!needle) return null;

  // Extraer ID si el nombre contiene un ID de 17-19 dígitos
  const idMatch = needle.match(/\b(\d{17,19})\b/);
  if (idMatch) {
    const extractedId = idMatch[1];
    try {
      const identity = await getCached(identityPath(extractedId), null);
      if (identity) {
        return { userId: extractedId, identity };
      }
    } catch { /* silencioso */ }
  }

  if (needle.length < 2) return null;
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
  archivePath,
  isMaliciousLink,
  saveMediaReference,
  getUserMedia,
};
