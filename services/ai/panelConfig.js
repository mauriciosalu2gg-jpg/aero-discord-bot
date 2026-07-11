// services/ai/panelConfig.js
// Config dinamica publicada por el panel web (Firestore config/ai), con
// refresco periodico. Aislado del resto de aiManager para mantener
// responsabilidades separadas.
let _cache = null;

async function load() {
  try {
    const { db } = await import('../../database/firebase.js');
    if (!db) return null;
    const snap = await db.collection('config').doc('ai').get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data.proveedorPrimario) return null;
    console.log(`[aiManager] Config de IA cargada desde Firestore: ${data.proveedorPrimario} / ${data.modeloActivo}`);
    return data;
  } catch (err) {
    console.warn('[aiManager] Firestore no disponible, usando fallback de .env:', err.message);
    return null;
  }
}

export function startConfigRefresh(intervalMinutes = 5) {
  setInterval(async () => {
    _cache = await load();
    if (_cache) {
      console.log(`[aiManager] Config de IA actualizada desde Firestore: ${_cache.proveedorPrimario}`);
    }
  }, intervalMinutes * 60 * 1000);
}

export async function getPanelConfig() {
  if (_cache === null) {
    _cache = await load();
  }
  return _cache;
}

export default { startConfigRefresh, getPanelConfig };
