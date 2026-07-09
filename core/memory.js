// core/memory.js
// Memoria persistente por canal. Usa Firestore si hay credenciales,
// si no cae a JSON local en data/memory/<channelId>.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database/firebase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, '..', 'data', 'memory');

function localPath(channelId) {
  return path.join(MEMORY_DIR, `${channelId}.json`);
}

function loadLocal(channelId) {
  try {
    return JSON.parse(fs.readFileSync(localPath(channelId), 'utf-8'));
  } catch {
    return { messages: [], summary: '', updatedAt: null };
  }
}

function saveLocal(channelId, data) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(localPath(channelId), JSON.stringify(data, null, 2));
}

export async function getMemory(channelId) {
  if (db) {
    try {
      const doc = await db.collection('memory').doc(channelId).get();
      if (doc.exists) return doc.data();
      return { messages: [], summary: '', updatedAt: null };
    } catch (err) {
      console.error('[memory/Firestore get]', err.message);
    }
  }
  return loadLocal(channelId);
}

export async function saveMemory(channelId, data) {
  const payload = { ...data, updatedAt: new Date().toISOString() };
  if (db) {
    try {
      await db.collection('memory').doc(channelId).set(payload, { merge: true });
      return;
    } catch (err) {
      console.error('[memory/Firestore set]', err.message);
    }
  }
  saveLocal(channelId, payload);
}

export async function resetMemory(channelId) {
  const empty = { messages: [], summary: '', updatedAt: new Date().toISOString() };
  await saveMemory(channelId, empty);
  return empty;
}

export async function resetAllMemory() {
  if (db) {
    try {
      const snap = await db.collection('memory').get();
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      console.error('[memory/Firestore reset all]', err.message);
    }
  }
  try {
    fs.rmSync(MEMORY_DIR, { recursive: true, force: true });
  } catch { /* nada que borrar */ }
}

export default { getMemory, saveMemory, resetMemory, resetAllMemory };
