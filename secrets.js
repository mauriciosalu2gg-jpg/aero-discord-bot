// secrets.js
// Cada proveedor tiene su propia API Key independiente en el .env.
// Cambiar de proveedor o rotar una key es solo editar el .env: no hay
// que tocar código en ningún archivo.
// La prioridad, escalera de modelos, cooldowns, etc. viven en config/providers.js.
import 'dotenv/config';
import { PROVIDER_PRIORITY, getModelLadder } from './config/providers.js';

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
      activos.push({ name, apiKey: data.apiKey, models: getModelLadder(name) });
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

export default {
  getAvailableProviders,
  getActiveProvider,
  getDiscordToken,
  PROVIDER_PRIORITY,
};
