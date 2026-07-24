import { db } from '../../database/firebase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISK_STORE_PATH = path.join(__dirname, '..', '..', 'data', 'memory_disk_store.json');

// Cargar backup local de disco si existe
let diskData = {};
try {
  if (fs.existsSync(DISK_STORE_PATH)) {
    diskData = JSON.parse(fs.readFileSync(DISK_STORE_PATH, 'utf8')) || {};
    console.log(`[cache] Backup local de disco cargado (${Object.keys(diskData).length} entradas).`);
  }
} catch {
  diskData = {};
}

function saveDiskStore() {
  try {
    const dir = path.dirname(DISK_STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_STORE_PATH, JSON.stringify(diskData, null, 2), 'utf8');
  } catch (err) {
    console.warn('[cache] No se pudo guardar disk store:', err.message);
  }
}

const cache = new Map();
// Inicializar cache en memoria desde diskData
for (const [key, val] of Object.entries(diskData)) {
  cache.set(key, val);
}

const dirtyKeys = new Set();
const FLUSH_INTERVAL_MS = 60 * 1000 * 2; // Flush cada 2 minutos

// Periodically flush dirty keys to Firebase and Disk
setInterval(async () => {
  if (dirtyKeys.size === 0) return;
  const keysToFlush = Array.from(dirtyKeys);
  dirtyKeys.clear();
  
  saveDiskStore();

  if (!db) return;

  const batch = db.batch();
  let batchCount = 0;
  
  for (const key of keysToFlush) {
    const data = cache.get(key);
    if (!data) continue;
    
    const segments = key.split('/');
    if (segments.length % 2 !== 0) continue;
    
    let docRef = db;
    for (let i = 0; i < segments.length; i += 2) {
      docRef = docRef.collection(segments[i]).doc(segments[i+1]);
    }
    
    batch.set(docRef, data, { merge: true });
    batchCount++;
    
    if (batchCount >= 400) {
      try { await batch.commit(); } catch (err) { console.error('[cache] Error flushing:', err); }
      batchCount = 0;
    }
  }
  
  if (batchCount > 0) {
    try { await batch.commit(); } catch (err) { console.error('[cache] Error flushing:', err); }
  }
  console.log(`[cache] Flushed ${keysToFlush.length} items a Firebase y Disco.`);
}, FLUSH_INTERVAL_MS);

export async function getCached(docPath, fallback = null) {
  if (cache.has(docPath)) return cache.get(docPath);
  
  if (diskData[docPath]) {
    cache.set(docPath, diskData[docPath]);
    return diskData[docPath];
  }

  if (db) {
    try {
      const segments = docPath.split('/');
      let docRef = db;
      for (let i = 0; i < segments.length; i += 2) {
        docRef = docRef.collection(segments[i]).doc(segments[i+1]);
      }
      const doc = await docRef.get();
      if (doc.exists) {
        const data = doc.data();
        cache.set(docPath, data);
        diskData[docPath] = data;
        saveDiskStore();
        return data;
      }
    } catch (err) {
      console.warn('[cache] Error al leer de Firebase:', err.message);
    }
  }
  
  return fallback;
}

export function setCached(docPath, data) {
  cache.set(docPath, data);
  diskData[docPath] = data;
  dirtyKeys.add(docPath);
  saveDiskStore();
}

export async function flushCached(docPath) {
  dirtyKeys.add(docPath);
  saveDiskStore();
}

export function deleteCached(docPath) {
  cache.delete(docPath);
  delete diskData[docPath];
  dirtyKeys.delete(docPath);
  saveDiskStore();
}

export default { getCached, setCached, flushCached, deleteCached };
