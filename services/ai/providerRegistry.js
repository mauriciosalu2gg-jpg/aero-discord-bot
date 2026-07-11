// services/ai/providerRegistry.js
// Registro único de adaptadores. Agregar un proveedor nuevo en el futuro
// significa: crear su adaptador en services/adapters/ y añadir una línea
// aquí. Nada más en el sistema necesita cambiar.
import { callGemini } from '../adapters/gemini.js';
import { callGroq } from '../adapters/groq.js';
import { callOpenAI } from '../adapters/openai.js';
import { callAnthropic } from '../adapters/anthropic.js';
import { callCerebras } from '../adapters/cerebras.js';
import { callOpenRouter } from '../adapters/openrouter.js';
import { callHuggingFace } from '../adapters/huggingface.js';
import { callMistral } from '../adapters/mistral.js';
import { callCohere } from '../adapters/cohere.js';

export const PROVIDER_ADAPTERS = {
  gemini: callGemini,
  groq: callGroq,
  openai: callOpenAI,
  anthropic: callAnthropic,
  cerebras: callCerebras,
  openrouter: callOpenRouter,
  huggingface: callHuggingFace,
  mistral: callMistral,
  cohere: callCohere,
};

/**
 * @param {string} name
 * @returns {(apiKey: string, model: string, history: Array, systemExtra?: string) => Promise<{text: string, tokens: number}>}
 */
export function getAdapter(name) {
  const adapter = PROVIDER_ADAPTERS[name];
  if (!adapter) throw new Error(`Proveedor desconocido: ${name}`);
  return adapter;
}

export default { PROVIDER_ADAPTERS, getAdapter };
