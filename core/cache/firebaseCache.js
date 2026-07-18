import { db } from '../../database/firebase.js';

const cache = new Map();
const dirtyKeys = new Set();
const FLUSH_INTERVAL_MS = 60 * 1000 * 5; // 5 minutos

// Periodically flush dirty keys to Firebase
setInterval(async () => {
  if (!db || dirtyKeys.size === 0) return;
  const keysToFlush = Array.from(dirtyKeys);
  dirtyKeys.clear();
  
  const batch = db.batch();
  let batchCount = 0;
  
  for (const key of keysToFlush) {
    const data = cache.get(key);
    if (!data) continue;
    
    // key format: "collection/docId/subcollection/subDocId..."
    const segments = key.split('/');
    if (segments.length % 2 !== 0) continue; // Must point to a document
    
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
  console.log(`[cache] Flushed ${keysToFlush.length} items to Firebase.`);
}, FLUSH_INTERVAL_MS);

/**
 * Get data from cache, fallback to Firebase if missing
 */
export async function getCached(docPath, fallback = null) {
  if (cache.has(docPath)) return cache.get(docPath);
  
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
        return data;
      }
    } catch (err) {
      console.error(`[cache] Error fetching ${docPath}:`, err.message);
    }
  }
  
  cache.set(docPath, fallback);
  return fallback;
}

/**
 * Set data in cache and mark for next Firebase flush
 */
export function setCached(docPath, data) {
  cache.set(docPath, data);
  dirtyKeys.add(docPath);
}

/**
 * Persiste un documento concreto sin esperar al ciclo de cinco minutos.
 * La memoria conversacional se guarda al terminar cada turno para que un
 * redeploy de Render no borre los últimos mensajes.
 */
export async function flushCached(docPath) {
  if (!db) return;

  const data = cache.get(docPath);
  if (!data) return;

  try {
    const segments = docPath.split('/');
    if (segments.length % 2 !== 0) return;

    let docRef = db;
    for (let i = 0; i < segments.length; i += 2) {
      docRef = docRef.collection(segments[i]).doc(segments[i + 1]);
    }
    await docRef.set(data, { merge: true });
    dirtyKeys.delete(docPath);
  } catch (err) {
    // Queda marcado como dirty para que el flush periódico lo reintente.
    dirtyKeys.add(docPath);
    console.error(`[cache] Error guardando ${docPath}:`, err.message);
  }
}

/**
 * Remove data from cache and immediately delete from Firebase
 */
export async function deleteCached(docPath) {
  cache.delete(docPath);
  dirtyKeys.delete(docPath);
  if (db) {
    try {
      const segments = docPath.split('/');
      let docRef = db;
      for (let i = 0; i < segments.length; i += 2) {
        docRef = docRef.collection(segments[i]).doc(segments[i+1]);
      }
      await docRef.delete();
    } catch (err) {
      console.error(`[cache] Error deleting ${docPath}:`, err.message);
    }
  }
}
