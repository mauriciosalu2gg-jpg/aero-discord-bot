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
 * @param {'quota'|'rateLimit'|'overloaded'|'offline'|'generic'} kind
 */
export function markCooldown(name, kind) {
  const s = ensure(name);
  const ms = getCooldownMs(name, kind);
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
    default: return HEALTH_STATUS.OFFLINE;
  }
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
// intentar los de mayor prioridad en cada mensaje.
let activeProvider = null; // { name, model }

export function getActiveProvider() {
  if (!activeProvider) return null;
  if (isOnCooldown(activeProvider.name)) {
    activeProvider = null;
    return null;
  }
  return activeProvider;
}

export function setActiveProvider(name, model) {
  activeProvider = { name, model };
}

export function clearActiveProvider() {
  activeProvider = null;
}

export default {
  HEALTH_STATUS,
  isOnCooldown,
  getCooldownRemainingMs,
  markCooldown,
  recordFailure,
  recordSuccess,
  getAverageLatency,
  getProviderSnapshot,
  getAllSnapshots,
  getActiveProvider,
  setActiveProvider,
  clearActiveProvider,
};
