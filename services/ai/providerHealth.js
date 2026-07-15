// services/ai/providerHealth.js
// Estado en memoria de cada proveedor: salud, cooldown y estadísticas.
// Vive mientras el proceso está corriendo (no persiste a disco/Firestore
// a propósito: si el bot se reinicia, todos los proveedores arrancan
// "Healthy" de nuevo, lo cual es el comportamiento correcto).
import { getCooldownMs, STATS_WINDOW_SIZE } from '../../config/providers.js';

export const HEALTH_STATUS = {
  HEALTHY: 'Healthy',
  SLOW: 'Slow',
  RATE_LIMITED: 'Rate Limited',
  QUOTA_EXCEEDED: 'Quota Exceeded',
  OFFLINE: 'Offline',
  UNAVAILABLE: 'Unavailable',
};

// Umbral de latencia (ms) por encima del cual se marca "Slow" tras un éxito.
const SLOW_LATENCY_MS = 4000;

/** @type {Map<string, object>} */
const state = new Map();

function ensure(name) {
  if (!state.has(name)) {
    state.set(name, {
      status: HEALTH_STATUS.HEALTHY,
      cooldownUntil: 0,
      lastCooldownKind: null,
      stats: {
        timesUsed: 0,
        errors: 0,
        lastError: null,
        lastErrorAt: null,
        lastSuccessAt: null,
        latencies: [], // ventana móvil, ms
      },
    });
  }
  return state.get(name);
}

/**
 * @param {string} name
 * @returns {boolean} true si el proveedor está en cooldown y debe saltarse.
 */
export function isOnCooldown(name) {
  const s = ensure(name);
  return Date.now() < s.cooldownUntil;
}

/**
 * @param {string} name
 * @returns {number} ms restantes de cooldown (0 si no aplica).
 */
export function getCooldownRemainingMs(name) {
  const s = ensure(name);
  return Math.max(0, s.cooldownUntil - Date.now());
}

/**
 * Marca un proveedor en cooldown según el tipo de fallo, actualizando su
 * estado de salud correspondiente.
 * @param {string} name
 * @param {'quota'|'rateLimit'|'overloaded'|'offline'|'modelNotFound'|'generic'} kind
 * @param {number} [retryAfterMs] - si el proveedor mando un header Retry-After
 * valido, se usa este valor en vez del cooldown por defecto de ese kind.
 */
export function markCooldown(name, kind, retryAfterMs) {
  const s = ensure(name);
  const ms = (Number.isFinite(retryAfterMs) && retryAfterMs > 0) ? retryAfterMs : getCooldownMs(name, kind);
  s.cooldownUntil = Date.now() + ms;
  s.lastCooldownKind = kind;
  s.status = kindToStatus(kind);
  return ms;
}

function kindToStatus(kind) {
  switch (kind) {
    case 'quota': return HEALTH_STATUS.QUOTA_EXCEEDED;
    case 'rateLimit': return HEALTH_STATUS.RATE_LIMITED;
    case 'overloaded': return HEALTH_STATUS.RATE_LIMITED;
    case 'offline': return HEALTH_STATUS.OFFLINE;
    case 'modelNotFound': return HEALTH_STATUS.OFFLINE;
    default: return HEALTH_STATUS.OFFLINE;
  }
}

/**
 * Marca un proveedor como Unavailable de forma persistente (hasta el proximo
 * restart o hasta que se revalide), tipicamente porque ninguno de sus
 * modelos configurados existe segun la validacion de arranque. A diferencia
 * de markCooldown, esto no tiene vencimiento automatico -- se usa cuando el
 * problema es de configuracion, no temporal.
 * @param {string} name
 * @param {string} [reason]
 */
export function markUnavailable(name, reason) {
  const s = ensure(name);
  s.status = HEALTH_STATUS.UNAVAILABLE;
  s.cooldownUntil = Date.now() + 24 * 60 * 60 * 1000; // 24h, se revalida en el proximo restart igual
  s.lastCooldownKind = 'modelNotFound';
  s.stats.lastError = reason || 'Ningún modelo configurado esta disponible';
  s.stats.lastErrorAt = Date.now();
}

/**
 * Registra un fallo (para estadísticas), independientemente de si aplica cooldown.
 * @param {string} name
 * @param {string} reason
 */
export function recordFailure(name, reason) {
  const s = ensure(name);
  s.stats.errors++;
  s.stats.lastError = reason;
  s.stats.lastErrorAt = Date.now();
}

/**
 * Registra un éxito: limpia cooldown, actualiza estadísticas y salud.
 * @param {string} name
 * @param {number} latencyMs
 */
export function recordSuccess(name, latencyMs) {
  const s = ensure(name);
  s.stats.timesUsed++;
  s.stats.lastSuccessAt = Date.now();
  s.stats.latencies.push(latencyMs);
  while (s.stats.latencies.length > STATS_WINDOW_SIZE) s.stats.latencies.shift();

  s.cooldownUntil = 0;
  s.lastCooldownKind = null;
  s.status = latencyMs > SLOW_LATENCY_MS ? HEALTH_STATUS.SLOW : HEALTH_STATUS.HEALTHY;
}

/**
 * @param {string} name
 * @returns {number} latencia promedio en ms (0 si no hay datos).
 */
export function getAverageLatency(name) {
  const s = ensure(name);
  if (!s.stats.latencies.length) return 0;
  const sum = s.stats.latencies.reduce((a, b) => a + b, 0);
  return Math.round(sum / s.stats.latencies.length);
}

/**
 * @param {string} name
 * @returns {object} snapshot completo del estado de un proveedor.
 */
export function getProviderSnapshot(name) {
  const s = ensure(name);
  return {
    name,
    status: s.status,
    onCooldown: isOnCooldown(name),
    cooldownRemainingMs: getCooldownRemainingMs(name),
    lastCooldownKind: s.lastCooldownKind,
    averageLatencyMs: getAverageLatency(name),
    timesUsed: s.stats.timesUsed,
    errors: s.stats.errors,
    lastError: s.stats.lastError,
    lastErrorAt: s.stats.lastErrorAt,
    lastSuccessAt: s.stats.lastSuccessAt,
  };
}

/**
 * @param {string[]} names
 * @returns {object[]} snapshot de todos los proveedores dados.
 */
export function getAllSnapshots(names) {
  return names.map(getProviderSnapshot);
}

// ── Caché de proveedor activo ──────────────────────────────────────────
// Mientras el proveedor activo siga sano, se reutiliza sin volver a
// intentar los de mayor prioridad en cada mensaje. PERO cada cierto
// tiempo (RECHECK_INTERVAL_MS) se fuerza una revalidacion, para que un
// proveedor de mayor prioridad que se recupero de un cooldown (o que
// recien se configuro, ej: se agrego una API key nueva) vuelva a tener
// chance de ser usado, en vez de quedar el bot pegado para siempre al
// primer proveedor que funciono una vez.
const RECHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 min

let activeProvider = null; // { name, model }
let activeProviderSetAt = 0;

export function getActiveProvider() {
  if (!activeProvider) return null;
  if (isOnCooldown(activeProvider.name)) {
    activeProvider = null;
    return null;
  }
  if (Date.now() - activeProviderSetAt > RECHECK_INTERVAL_MS) {
    // No lo borramos de golpe (evita descartar un proveedor sano sin
    // necesidad); resilientDispatcher.js igual va a intentar primero la
    // cadena en orden de prioridad si devolvemos null aca.
    activeProvider = null;
    return null;
  }
  return activeProvider;
}

export function setActiveProvider(name, model) {
  activeProvider = { name, model };
  activeProviderSetAt = Date.now();
}

export function clearActiveProvider() {
  activeProvider = null;
  activeProviderSetAt = 0;
}

// ── Forzado manual por el creador/subcreador ("/bot ai force <proveedor>") ──
// Si esta seteado, dispatchWithFallback SOLO intenta este proveedor (con
// su escalera normal de modelos), ignorando prioridad y cache normal, para
// poder probar un proveedor puntual a pedido. No tiene expiracion automatica
// por tiempo: se limpia con el mismo comando ("/bot ai force auto") o al
// reiniciar el proceso.
let forcedProviderName = null;

export function getForcedProvider() {
  return forcedProviderName;
}

export function setForcedProvider(name) {
  forcedProviderName = name || null;
}

export function clearForcedProvider() {
  forcedProviderName = null;
}

// ── Reporte de estado en tiempo real (Panel de Control) ───────────────
export function startHealthReporting(db, providerNames, client, intervalMs = 60000) {
  if (!db) return;
  setInterval(async () => {
    try {
      const snapshots = getAllSnapshots(providerNames);
      
      const discordStats = client ? {
        ping: client.ws.ping,
        status: client.ws.status === 0 ? 'Conectado' : 'Desconectado',
        uptime: client.uptime
      } : null;

      await db.collection('bot').doc('ai_health').set({
        updatedAt: new Date().toISOString(),
        providers: snapshots,
        discord: discordStats
      });
    } catch (err) {
      console.error('[providerHealth] Error al reportar salud a Firestore:', err.message);
    }
  }, intervalMs);
}

export default {
  HEALTH_STATUS,
  isOnCooldown,
  getCooldownRemainingMs,
  markCooldown,
  markUnavailable,
  recordFailure,
  recordSuccess,
  getAverageLatency,
  getProviderSnapshot,
  getAllSnapshots,
  getActiveProvider,
  setActiveProvider,
  clearActiveProvider,
  getForcedProvider,
  setForcedProvider,
  clearForcedProvider,
  startHealthReporting,
};
