// services/ai/resilientDispatcher.js
// Motor de resiliencia: para cada proveedor intenta su escalera de modelos
// (mejor -> peor) y, si el proveedor entero falla, salta transparentemente
// al siguiente de la prioridad. La conversación (history) es la misma en
// cada intento, así que el cambio de proveedor es invisible para el usuario.
//
// Añade sobre la base original:
//   - Salta proveedores en cooldown activo.
//   - Cachea el proveedor activo mientras siga sano (no reintenta desde
//     el principio de la prioridad en cada mensaje).
//   - Registra salud, cooldown y estadísticas (tiempo de respuesta, errores).
import { getAdapter } from './providerRegistry.js';
import { isRetryableProviderError, classifyFailureReason, classifyFailureKind } from './errorClassifier.js';
import {
  isOnCooldown,
  getCooldownRemainingMs,
  markCooldown,
  recordFailure,
  recordSuccess,
  getActiveProvider,
  setActiveProvider,
  clearActiveProvider,
} from './providerHealth.js';

function fmtMs(ms) {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 1000)}s`;
}

/**
 * @param {object} params
 * @param {Array<{name:string, apiKey:string, models:string[]}>} params.providers - ya en orden de prioridad
 * @param {Array} params.history
 * @param {string} params.systemExtra
 * @returns {Promise<{text: string, tokens: number, provider: string, model: string, latencyMs: number}>}
 */
export async function dispatchWithFallback({ providers, history, systemExtra }) {
  const attempts = [];
  const byName = new Map(providers.map(p => [p.name, p]));

  // ── 1. Intentar primero el proveedor activo cacheado, si sigue disponible
  //       y sigue estando en la lista de proveedores con API Key. ──
  const cached = getActiveProvider();
  if (cached && byName.has(cached.name) && !isOnCooldown(cached.name)) {
    const provider = byName.get(cached.name);
    const model = cached.model || provider.models[0];
    const result = await tryOnce(provider, model, history, systemExtra, attempts);
    if (result) return result;
    // Si el proveedor cacheado falló, cae al recorrido normal de abajo
    // (que ya lo va a saltar mientras esté en cooldown).
  }

  // ── 2. Recorrido normal en orden de prioridad ──
  for (const provider of providers) {
    if (cached && provider.name === cached.name) continue; // ya se intentó arriba

    if (isOnCooldown(provider.name)) {
      const remaining = fmtMs(getCooldownRemainingMs(provider.name));
      console.log(`[AI] ${provider.name} en cooldown (${remaining} restantes) — saltando`);
      continue;
    }

    const models = provider.models.length ? provider.models : [undefined];
    let brokeOutForNonRetryable = false;

    for (const model of models) {
      const result = await tryOnce(provider, model, history, systemExtra, attempts);
      if (result) return result;

      const last = attempts[attempts.length - 1];
      if (!last.retryable) { brokeOutForNonRetryable = true; break; }
    }
    if (brokeOutForNonRetryable) continue;
  }

  const trail = attempts.map(a => `${a.provider}/${a.model}: ${a.reason}`).join(' → ');
  const err = new Error(
    `Todos los proveedores de IA fallaron. Intentos: ${trail || 'ninguno configurado'}`
  );
  err.attempts = attempts;
  throw err;
}

/**
 * Intenta un único (proveedor, modelo). Devuelve el resultado si tiene éxito,
 * o null si falló (y ya quedó registrado en `attempts` + salud/cooldown).
 */
async function tryOnce(provider, model, history, systemExtra, attempts) {
  const adapter = getAdapter(provider.name);
  const startedAt = Date.now();

  try {
    console.log(`[AI] Proveedor: ${provider.name} | Modelo: ${model}`);
    const result = await adapter(provider.apiKey, model, history, systemExtra);
    const latencyMs = Date.now() - startedAt;

    recordSuccess(provider.name, latencyMs);
    setActiveProvider(provider.name, model);

    if (attempts.length > 0) {
      console.log(`[AI] Proveedor activo tras fallback: ${provider.name} | Modelo: ${model} | Tiempo: ${latencyMs} ms`);
    } else {
      console.log(`[AI] Proveedor activo: ${provider.name} | Modelo: ${model} | Tiempo: ${latencyMs} ms`);
    }

    return { text: result.text, tokens: result.tokens, provider: provider.name, model, latencyMs };
  } catch (err) {
    const reason = classifyFailureReason(err, err.statusCode);
    const kind = classifyFailureKind(err, err.statusCode);
    const retryable = isRetryableProviderError(err, err.statusCode);

    recordFailure(provider.name, reason);
    attempts.push({ provider: provider.name, model, reason, retryable });
    console.warn(`[AI] ${provider.name} (${model}) falló: ${reason}`);

    if (retryable) {
      const cooldownMs = markCooldown(provider.name, kind);
      console.log(`[AI] ${provider.name} → Cooldown ${fmtMs(cooldownMs)}`);
    }

    if (getActiveProviderName() === provider.name) {
      clearActiveProvider();
    }

    return null;
  }
}

function getActiveProviderName() {
  const active = getActiveProvider();
  return active ? active.name : null;
}

export default { dispatchWithFallback };
