// config/providers.js
// Configuración centralizada de todos los proveedores de IA.

export const STATS_WINDOW_SIZE = 10;

export const PROVIDER_PRIORITY = [
  'groq',
  'gemini',
  'openrouter',
  'openai',
  'anthropic',
  'cerebras',
  'mistral',
  'cohere',
  'huggingface',
];

export const MODEL_LADDERS = {
  gemini: [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
  ],
  anthropic: [
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
  ],
  cerebras: [
    'llama-3.3-70b',
  ],
  openrouter: [
    'google/gemini-2.0-flash-001',
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat',
  ],
  huggingface: [
    'meta-llama/Llama-3.3-70B-Instruct',
  ],
  mistral: [
    'mistral-small-latest',
    'mistral-large-latest',
  ],
  cohere: [
    'command-r-plus-08-2024',
    'command-r-08-2024',
  ],
};

export const DEFAULT_COOLDOWNS_MS = {
  rateLimit: 30_000,      // 30 segundos si dio rate limit
  quotaExhausted: 60_000, // 1 minuto si se agotó cuota
  serverError: 15_000,    // 15 segundos si fue 5xx
  timeout: 10_000,        // 10 segundos por timeout
  invalidAuth: 300_000,   // 5 minutos si la key es inválida
  modelNotFound: 10_000,  // 10 segundos si el modelo dio 404
  default: 20_000,        // 20 segundos por defecto
};

export const MODEL_DISCOVERY_URLS = {
  groq: 'https://api.groq.com/openai/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  openai: 'https://api.openai.com/v1/models',
};

export function getModelLadder(providerName) {
  return MODEL_LADDERS[providerName] || [];
}

export function getCooldownMs(kind) {
  return DEFAULT_COOLDOWNS_MS[kind] || DEFAULT_COOLDOWNS_MS.default;
}

export function getMaxTokens(intent = 'chat') {
  if (intent === 'moderation') return 300;
  if (intent === 'summary') return 600;
  return 1000;
}

export function getRepetitionControls(intent = 'chat') {
  return { presence_penalty: 0.1, frequency_penalty: 0.1 };
}

export default {
  STATS_WINDOW_SIZE,
  PROVIDER_PRIORITY,
  MODEL_LADDERS,
  DEFAULT_COOLDOWNS_MS,
  MODEL_DISCOVERY_URLS,
  getModelLadder,
  getCooldownMs,
  getMaxTokens,
  getRepetitionControls,
};
