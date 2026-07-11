// core/memory.js
// Memoria persistente en Firestore (necesario porque el bot corre en
// Render: el filesystem es efimero y se borra en cada redeploy/restart,
// asi que JSON local NO sirve para produccion). Todo esta organizado por
// servidor (guild), asi cada uno tiene su espacio separado y no se pisan:
//
//   guilds/{guildId}                          -> doc con name, addedAt
//   guilds/{guildId}/memory/{channelId}        -> historial de chat de ese canal
//   guilds/{guildId}/stats/tokens               -> tokens gastados en ESE server
//
// Si Firestore no esta disponible por algun motivo puntual (caida de red,
// credenciales faltantes en un entorno de prueba local), cae a un JSON
// local en data/memory/ como red de seguridad -- pero en Render siempre
// deberia estar disponible porque las credenciales ya estan en las
// Environment Variables.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database/firebase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FALLBACK_DIR = path.join(__dirname, '..', 'data', 'memory');

function guildScope(guildId) {
  return guildId || '_dm';
}

// ── Fallback local (solo si Firestore no esta arriba) ──────────────────

function localFile(guildId, category, key) {
  return path.join(LOCAL_FALLBACK_DIR, guildScope(guildId), category, `${key}.json`);
}

function readLocalJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeLocalJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ── Memoria de chat por canal, dentro del servidor correspondiente ─────

export async function getMemory(channelId, guildId = null) {
  const empty = { messages: [], summary: '', updatedAt: null };
  if (db) {
    try {
      const doc = await db
        .collection('guilds').doc(guildScope(guildId))
        .collection('memory').doc(channelId)
        .get();
      if (doc.exists) return doc.data();
      return empty;
    } catch (err) {
      console.error('[memory/Firestore get]', err.message);
    }
  }
  return readLocalJSON(localFile(guildId, 'chat', channelId), empty);
}

export async function saveMemory(channelId, data, guildId = null) {
  const payload = { ...data, updatedAt: new Date().toISOString() };
  if (db) {
    try {
      await db
        .collection('guilds').doc(guildScope(guildId))
        .collection('memory').doc(channelId)
        .set(payload, { merge: true });
      return;
    } catch (err) {
      console.error('[memory/Firestore set]', err.message);
    }
  }
  writeLocalJSON(localFile(guildId, 'chat', channelId), payload);
}

export async function resetMemory(channelId, guildId = null) {
  const empty = { messages: [], summary: '', updatedAt: new Date().toISOString() };
  await saveMemory(channelId, empty, guildId);
  return empty;
}

// Borra TODA la memoria de chat de un servidor especifico (todos los canales).
export async function resetGuildMemory(guildId) {
  if (db) {
    try {
      const snap = await db.collection('guilds').doc(guildScope(guildId)).collection('memory').get();
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      console.error('[memory/Firestore reset guild]', err.message);
    }
  }
  try {
    fs.rmSync(path.join(LOCAL_FALLBACK_DIR, guildScope(guildId)), { recursive: true, force: true });
  } catch { /* nada que borrar */ }
}

// Borra la memoria de TODOS los servidores (uso restringido a Lara).
export async function resetAllMemory() {
  if (db) {
    try {
      const guildsSnap = await db.collection('guilds').get();
      for (const guildDoc of guildsSnap.docs) {
        const memSnap = await guildDoc.ref.collection('memory').get();
        const batch = db.batch();
        memSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error('[memory/Firestore reset all]', err.message);
    }
  }
  try {
    fs.rmSync(LOCAL_FALLBACK_DIR, { recursive: true, force: true });
  } catch { /* nada que borrar */ }
}

// ── Estadisticas de tokens, separadas por servidor ─────────────────────
// guilds/{guildId}/stats/tokens -> { total: number, updatedAt }

export async function getGuildTokenUsage(guildId) {
  if (db) {
    try {
      const doc = await db.collection('guilds').doc(guildScope(guildId)).collection('stats').doc('tokens').get();
      if (doc.exists) return doc.data().total || 0;
      return 0;
    } catch (err) {
      console.error('[memory/Firestore getTokens]', err.message);
    }
  }
  return readLocalJSON(localFile(guildId, 'stats', 'tokens'), { total: 0 }).total || 0;
}

export async function addGuildTokenUsage(guildId, tokens) {
  if (!guildId || !tokens) return;
  if (db) {
    try {
      const admin = (await import('firebase-admin')).default;
      await db.collection('guilds').doc(guildScope(guildId)).collection('stats').doc('tokens').set({
        total: admin.firestore.FieldValue.increment(tokens),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return;
    } catch (err) {
      console.error('[memory/Firestore addTokens]', err.message);
    }
  }
  const file = localFile(guildId, 'stats', 'tokens');
  const data = readLocalJSON(file, { total: 0 });
  data.total = (data.total || 0) + tokens;
  data.updatedAt = new Date().toISOString();
  writeLocalJSON(file, data);
}

// Total acumulado de TODOS los servidores juntos (para /modelstatus).
export async function getGlobalTokenUsage() {
  if (db) {
    try {
      const guildsSnap = await db.collection('guilds').get();
      let sum = 0;
      for (const guildDoc of guildsSnap.docs) {
        const tokensDoc = await guildDoc.ref.collection('stats').doc('tokens').get();
        if (tokensDoc.exists) sum += tokensDoc.data().total || 0;
      }
      return sum;
    } catch (err) {
      console.error('[memory/Firestore globalTokens]', err.message);
    }
  }
  try {
    const dirs = fs.readdirSync(LOCAL_FALLBACK_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    let sum = 0;
    for (const gid of dirs) sum += readLocalJSON(localFile(gid, 'stats', 'tokens'), { total: 0 }).total || 0;
    return sum;
  } catch {
    return 0;
  }
}

// ── Registro de servidores conocidos ────────────────────────────────────
// guilds/{guildId} -> { name, addedAt }

export async function registerGuildLocal(guild) {
  const data = { name: guild.name, addedAt: new Date().toISOString() };
  if (db) {
    try {
      const docRef = db.collection('guilds').doc(guild.id);
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set(data);
        console.log(`[memory/Firestore] Servidor registrado: ${guild.name} (${guild.id})`);
      }
      return { id: guild.id, ...(doc.exists ? doc.data() : data) };
    } catch (err) {
      console.error('[memory/Firestore registerGuild]', err.message);
    }
  }
  const file = localFile(guild.id, 'stats', 'guild');
  if (fs.existsSync(file)) return readLocalJSON(file, null);
  writeLocalJSON(file, data);
  return data;
}

export default {
  getMemory,
  saveMemory,
  resetMemory,
  resetGuildMemory,
  resetAllMemory,
  getGuildTokenUsage,
  addGuildTokenUsage,
  getGlobalTokenUsage,
  registerGuildLocal,
};
