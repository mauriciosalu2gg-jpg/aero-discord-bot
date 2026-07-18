// secrets.js
// Cada proveedor tiene su propia API Key independiente en el .env.
// Cambiar de proveedor o rotar una key es solo editar el .env: no hay
// que tocar código en ningún archivo.
// La prioridad, escalera de modelos, cooldowns, etc. viven en config/providers.js.
import 'dotenv/config';
import { PROVIDER_PRIORITY, getModelLadder } from './config/providers.js';
import { filterValidModels } from './services/ai/modelValidator.js';

const SECRETS = {
  discordToken: process.env.DISCORD_TOKEN || '',

  providers: {
    gemini: { apiKey: process.env.GEMINI_API_KEY || '' },
    groq: { apiKey: process.env.GROQ_API_KEY || '' },
    openai: { apiKey: process.env.OPENAI_API_KEY || '' },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY || '' },
    cerebras: { apiKey: process.env.CEREBRAS_API_KEY || '' },
    openrouter: { apiKey: process.env.OPENROUTER_API_KEY || '' },
    huggingface: { apiKey: process.env.HUGGINGFACE_API_KEY || '' },
    mistral: { apiKey: process.env.MISTRAL_API_KEY || '' },
    cohere: { apiKey: process.env.COHERE_API_KEY || '' },
  },

  memory: {
    enabled: process.env.MEMORY_ENABLED === 'true',
    provider: process.env.MEMORY_PROVIDER || 'router',
    groqKey1: process.env.MEMORY_GROQ_KEY_1 || '',
    groqKey2: process.env.MEMORY_GROQ_KEY_2 || '',
    geminiKey: process.env.MEMORY_GEMINI_KEY || '',
    ollamaUrl: process.env.MEMORY_OLLAMA_URL || 'http://localhost:11434',
    openrouterKey: process.env.MEMORY_OPENROUTER_KEY || '',
    topicModel: process.env.MEMORY_TOPIC_MODEL || 'llama-3.1-8b',
    summaryModel: process.env.MEMORY_SUMMARY_MODEL || 'llama-3.3-70b',
    profileModel: process.env.MEMORY_PROFILE_MODEL || 'gemma-3',
  },
};

export { PROVIDER_PRIORITY };

/**
 * Retorna todos los proveedores con API Key configurada, en el orden de
 * PROVIDER_PRIORITY (config/providers.js), cada uno con su escalera de
 * modelos ya resuelta.
 * @returns {Array<{name: string, apiKey: string, models: string[]}>}
 */
function getAvailableProviders() {
  const activos = [];
  for (const name of PROVIDER_PRIORITY) {
    const data = SECRETS.providers[name];
    if (data && data.apiKey && data.apiKey.trim() !== '') {
      const models = filterValidModels(name, getModelLadder(name));
      activos.push({ name, apiKey: data.apiKey, models });
    }
  }
  return activos;
}

/**
 * Primer proveedor disponible según la prioridad configurada (legacy support).
 */
function getActiveProvider() {
  const activos = getAvailableProviders();
  return activos.length > 0 ? activos[0] : null;
}

function getDiscordToken() {
  return SECRETS.discordToken;
}

function getMemoryConfig() {
  return SECRETS.memory;
}

export default {
  getAvailableProviders,
  getActiveProvider,
  getDiscordToken,
  getMemoryConfig,
  PROVIDER_PRIORITY,
};
