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

/**
 * Determina si un error amerita saltar al siguiente proveedor en la cadena
 * de fallback, en vez de propagarse como fallo definitivo.
 * @param {Error|string} error
 * @param {number} [statusCode]
 * @returns {boolean}
 */
export function isRetryableProviderError(error, statusCode) {
  if (statusCode === 429 || statusCode === 503 || statusCode === 502) return true;
  const message = typeof error === 'string' ? error : (error?.message || '');
  return RETRYABLE_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Clasifica el motivo de fallo en una etiqueta corta, útil para logs.
 * @param {Error|string} error
 * @param {number} [statusCode]
 * @returns {string}
 */
export function classifyFailureReason(error, statusCode) {
  const message = typeof error === 'string' ? error : (error?.message || '');
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
 * @returns {'quota'|'rateLimit'|'overloaded'|'offline'|'generic'}
 */
export function classifyFailureKind(error, statusCode) {
  const message = typeof error === 'string' ? error : (error?.message || '');
  if (/quota|resource_exhausted|daily limit|insufficient_quota/i.test(message)) return 'quota';
  if (/rate.?limit|too many requests|\b429\b/i.test(message) || statusCode === 429) return 'rateLimit';
  if (/capacity|overloaded|high demand/i.test(message)) return 'overloaded';
  if (/service unavailable|\b503\b|\b502\b|timed? ?out|network|fetch failed|econnrefused|enotfound/i.test(message) || statusCode === 503 || statusCode === 502) return 'offline';
  return 'generic';
}

export default { isRetryableProviderError, classifyFailureReason, classifyFailureKind };
