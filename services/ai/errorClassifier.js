// services/ai/errorClassifier.js
// Analizador central de errores de proveedores de IA.
// No se limita al status HTTP: revisa el texto del mensaje de error
// porque cada proveedor devuelve algo distinto para el mismo problema.

const RETRYABLE_PATTERNS = [
  /quota\s*exceeded/i,
  /resource_exhausted/i,
  /rate.?limit/i,
  /too many requests/i,
  /\b429\b/i,
  /capacity/i,
  /overloaded/i,
  /daily limit/i,
  /billing/i,
  /high demand/i,
  /insufficient_quota/i,
  /model_not_available/i,
  /service unavailable/i,
  /\b503\b/i,
  /\b502\b/i,
  /timed? ?out/i,
  /credit/i,
];

// Patrones que indican que el MODELO puntual no existe/no esta disponible
// (no el proveedor entero). Ej: OpenRouter "No endpoints found for X",
// HTTP 404 de un nombre de modelo viejo o mal escrito. Esto amerita saltar
// al siguiente modelo de la escalera del mismo proveedor sin gastar un
// cooldown largo, ya que no es un problema temporal sino un modelo
// invalido/retirado.
const MODEL_NOT_FOUND_PATTERNS = [
  /no endpoints found/i,
  /model_not_found/i,
  /model not found/i,
  /does not exist/i,
  /unknown model/i,
  /invalid model/i,
  /\bmodel\b.*\bnot\b.*\bavailable\b/i,
];

/**
 * Determina si un error amerita saltar al siguiente proveedor en la cadena
 * de fallback, en vez de propagarse como fallo definitivo.
 * @param {Error|string} error
 * @param {number} [statusCode]
 * @returns {boolean}
 */
export function isRetryableProviderError(error, statusCode) {
  if (isModelNotFoundError(error, statusCode)) return true;
  if (statusCode === 429 || statusCode === 503 || statusCode === 502) return true;
  const message = typeof error === 'string' ? error : (error?.message || '');
  return RETRYABLE_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * @param {Error|string} error
 * @param {number} [statusCode]
 * @returns {boolean} true si el modelo puntual no existe/fue retirado
 * (HTTP 404, "no endpoints found", etc), a diferencia de un fallo
 * temporal del proveedor entero.
 */
export function isModelNotFoundError(error, statusCode) {
  const message = typeof error === 'string' ? error : (error?.message || '');
  if (MODEL_NOT_FOUND_PATTERNS.some(pattern => pattern.test(message))) return true;
  if (statusCode === 404) return true;
  return false;
}

/**
 * Clasifica el motivo de fallo en una etiqueta corta, útil para logs.
 * @param {Error|string} error
 * @param {number} [statusCode]
 * @returns {string}
 */
export function classifyFailureReason(error, statusCode) {
  const message = typeof error === 'string' ? error : (error?.message || '');
  if (isModelNotFoundError(error, statusCode)) return 'Model not available';
  if (/quota|resource_exhausted|daily limit|insufficient_quota/i.test(message)) return 'cuota agotada';
  if (/rate.?limit|too many requests|\b429\b/i.test(message) || statusCode === 429) return 'rate limit';
  if (/capacity|overloaded|high demand/i.test(message)) return 'sobrecarga del proveedor';
  if (/billing|credit/i.test(message)) return 'problema de facturación';
  if (/service unavailable|\b503\b|\b502\b/i.test(message) || statusCode === 503 || statusCode === 502) return 'servicio no disponible';
  if (/timed? ?out/i.test(message)) return 'timeout';
  if (!message) return 'error desconocido';
  return message.slice(0, 120);
}

/**
 * Clasifica el error en un "kind" usado para decidir cuánto dura el cooldown.
 * @param {Error|string} error
 * @param {number} [statusCode]
 * @returns {'quota'|'rateLimit'|'overloaded'|'offline'|'modelNotFound'|'generic'}
 */
export function classifyFailureKind(error, statusCode) {
  const message = typeof error === 'string' ? error : (error?.message || '');
  if (isModelNotFoundError(error, statusCode)) return 'modelNotFound';
  if (/quota|resource_exhausted|daily limit|insufficient_quota/i.test(message)) return 'quota';
  if (/rate.?limit|too many requests|\b429\b/i.test(message) || statusCode === 429) return 'rateLimit';
  if (/capacity|overloaded|high demand/i.test(message)) return 'overloaded';
  if (/service unavailable|\b503\b|\b502\b|timed? ?out|network|fetch failed|econnrefused|enotfound/i.test(message) || statusCode === 503 || statusCode === 502) return 'offline';
  return 'generic';
}

export default { isRetryableProviderError, isModelNotFoundError, classifyFailureReason, classifyFailureKind };
