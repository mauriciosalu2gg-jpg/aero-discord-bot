// services/aiManager.js
// Orquestador de IA. Responsabilidades separadas en módulos propios:
//   - services/ai/panelConfig.js      -> config dinámica desde el panel web
//   - services/ai/systemContext.js    -> bloque extra de sistema (mood, memoria, etc)
//   - services/ai/resilientDispatcher.js -> escalera de modelos + fallback entre proveedores
//   - services/ai/providerRegistry.js -> mapeo nombre -> adaptador
//   - services/adapters/*             -> un archivo por proveedor
//   - services/adapters/local.js      -> Ollama / LM Studio (último recurso)
import secrets from '../secrets.js';
import { getModelLadder } from './ai/modelLadders.js';
import { startConfigRefresh, getPanelConfig } from './ai/panelConfig.js';
import { buildSystemExtra } from './ai/systemContext.js';
import { dispatchWithFallback } from './ai/resilientDispatcher.js';
import { callOllama, callLMStudio } from './adapters/local.js';

export { startConfigRefresh };

const TOKENS_THRESHOLD = 6000;

/**
 * Punto de entrada único para pedir una respuesta de IA con fallback
 * transparente entre proveedores. La conversación (history) se mantiene
 * idéntica en cada intento, así que un cambio de proveedor a mitad de
 * conversación es invisible para el usuario.
 * @param {Array} history
 * @param {number} recentTokens
 * @param {object} extra - { moodInfo, isOwner, memorySummary, webContext, guild, channelName, swearingAllowed, respectfulOnly }
 */
export async function askAI(history, recentTokens = 0, extra = {}) {
  const systemExtra = buildSystemExtra(extra);
  const panelConfig = await getPanelConfig();

  const providerChain = buildProviderChain(panelConfig, recentTokens, extra.intent || 'chat');

  try {
    return await dispatchWithFallback({ providers: providerChain, history, systemExtra, intent: extra.intent || 'chat' });
  } catch (cloudErr) {
    console.warn(`[aiManager] Todos los proveedores en la nube fallaron: ${cloudErr.message}`);
  }

  // Último recurso: modelos locales.
  try {
    console.log('[AI] Intentando Ollama local como último recurso...');
    const model = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2';
    const result = await callOllama(model, history, systemExtra);
    return { text: result.text, tokens: result.tokens, provider: 'ollama', model };
  } catch {
    // Ollama no disponible, seguimos al siguiente recurso local.
  }

  try {
    console.log('[AI] Intentando LM Studio local como último recurso...');
    const result = await callLMStudio(history, systemExtra);
    return { text: result.text, tokens: result.tokens, provider: 'lmstudio', model: 'local' };
  } catch {
    // LM Studio tampoco disponible.
  }

  throw new Error(
    'Todos los proveedores de IA fallaron (nube y locales). ' +
    'Configura una API Key en el .env o en el panel, o instala Ollama/LM Studio.'
  );
}

/**
 * Arma la cadena de proveedores a intentar, en este orden:
 * 1. Proveedor primario elegido desde el panel web (si tiene API Key propia).
 * 2. El resto de proveedores del .env, en el orden de secrets.PROVIDER_PRIORITY,
 *    sin repetir el que ya se puso primero.
 * @param {object|null} panelConfig
 * @param {number} recentTokens
 * @returns {Array<{name:string, apiKey:string, models:string[]}>}
 */
function buildProviderChain(panelConfig, recentTokens, intent = 'chat') {
  const envProviders = secrets.getAvailableProviders();
  const chain = [];
  const seen = new Set();
  
  const isFastIntent = intent === 'moderation' || intent === 'summary';

  // Si es chat, respetamos la preferencia del panel.
  // Si es moderacion/resumen, ignoramos la preferencia de chat y vamos directo a los livianos.
  if (!isFastIntent && panelConfig?.proveedorPrimario) {
    const name = panelConfig.proveedorPrimario;
    const preferredModel = panelConfig.modeloActivo;
    const apiKey = panelConfig.apiKey || envProviders.find(p => p.name === name)?.apiKey;
    
    if (apiKey) {
      const ladder = preferredModel
        ? [preferredModel, ...getModelLadder(name).filter(m => m !== preferredModel)]
        : getModelLadder(name);
      chain.push({ name, apiKey, models: ladder });
      seen.add(name);
    }
  }

  for (const provider of envProviders) {
    if (seen.has(provider.name)) continue;
    // Si es intent rapido (moderacion/resumen) o hay muchos tokens, usamos los modelos livianos primero.
    const models = (isFastIntent || recentTokens > TOKENS_THRESHOLD)
      ? [...provider.models].reverse()
      : provider.models;
    chain.push({ name: provider.name, apiKey: provider.apiKey, models });
    seen.add(provider.name);
  }

  return chain;
}

export default askAI;
