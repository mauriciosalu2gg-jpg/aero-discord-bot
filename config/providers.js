// config/providers.js
// Configuración centralizada de todos los proveedores de IA.
// Para agregar un proveedor nuevo: crear su adaptador en services/adapters/,
// registrarlo en services/ai/providerRegistry.js, y añadir su entrada aquí.
// Nada más en el proyecto necesita tocarse.

/**
 * Orden de prioridad. Reordenar este arreglo cambia el orden de fallback
 * en todo el sistema.
 */
export const PROVIDER_PRIORITY = [
  'openrouter',
  'groq',
  'cerebras',
  'mistral',
  'gemini',
  'cohere',
  'openai',
  'anthropic',
  'huggingface',
];

/**
 * Escalera de modelos por proveedor (mejor -> peor). Si el primero falla
 * por cuota/rate-limit se prueba el siguiente antes de cambiar de proveedor.
 */
export const MODEL_LADDERS = {
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ],
  openai: [
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o-mini',
  ],
  anthropic: [
    'claude-sonnet-5',
    'claude-haiku-4-5-20251001',
  ],
  cerebras: [
    'llama-3.3-70b',
    'gpt-oss-120b',
  ],
  openrouter: [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
  ],
  huggingface: [
    'meta-llama/Llama-3.3-70B-Instruct',
  ],
  mistral: [
    'mistral-large-latest',
    'mistral-small-latest',
  ],
  cohere: [
    'command-r-plus-08-2024',
    'command-r-08-2024',
  ],
};

/**
 * Tiempo de cooldown (ms) por proveedor y tipo de fallo. Se puede afinar
 * por proveedor si alguno se recupera más rápido/lento que el resto.
 */
export const COOLDOWN_MS = {
  default: {
    quota: 30 * 60 * 1000,       // cuota agotada: 30 min
    rateLimit: 10 * 60 * 1000,   // rate limit: 10 min
    overloaded: 5 * 60 * 1000,   // alta demanda / overloaded: 5 min
    offline: 2 * 60 * 1000,      // error de red / servicio caído: 2 min
    generic: 3 * 60 * 1000,      // cualquier otro error retryable: 3 min
  },
  // Overrides opcionales por proveedor, ej:
  // groq: { overloaded: 2 * 60 * 1000 },
};

/** Timeout máximo (ms) por request a un proveedor. */
export const REQUEST_TIMEOUT_MS = 25_000;

/** Reintentos dentro del mismo modelo antes de pasar al siguiente (0 = sin reintento). */
export const RETRIES_PER_MODEL = 0;

/** Umbral de tokens recientes a partir del cual se prioriza el modelo más liviano. */
export const HEAVY_HISTORY_TOKENS_THRESHOLD = 6000;

/** Cuántas llamadas recientes se guardan por proveedor para el promedio de latencia. */
export const STATS_WINDOW_SIZE = 20;

export function getCooldownMs(providerName, kind) {
  const perProvider = COOLDOWN_MS[providerName];
  if (perProvider && perProvider[kind] != null) return perProvider[kind];
  return COOLDOWN_MS.default[kind] ?? COOLDOWN_MS.default.generic;
}

export function getModelLadder(providerName) {
  return MODEL_LADDERS[providerName] || [];
}

/**
 * Un modelo se considera "basico" (poco potente) si es el ultimo de su
 * escalera, o si su nombre trae pistas tipicas de gama baja (lite/mini/
 * instant/8b/flash-lite/haiku). Se usa para decidir si conviene mandarle
 * un contexto mega resumido en vez del historial completo, mientras los
 * modelos mejores se recuperan de cooldown.
 */
export function isBasicModel(providerName, model) {
  if (!model) return true;
  const ladder = getModelLadder(providerName);
  const isLastOfLadder = ladder.length > 0 && model === ladder[ladder.length - 1];
  const lowTierHints = /lite|mini|instant|8b|haiku|small|nano/i.test(model);
  return isLastOfLadder || lowTierHints;
}

export default {
  PROVIDER_PRIORITY,
  MODEL_LADDERS,
  COOLDOWN_MS,
  REQUEST_TIMEOUT_MS,
  RETRIES_PER_MODEL,
  HEAVY_HISTORY_TOKENS_THRESHOLD,
  STATS_WINDOW_SIZE,
  getCooldownMs,
  getModelLadder,
};
