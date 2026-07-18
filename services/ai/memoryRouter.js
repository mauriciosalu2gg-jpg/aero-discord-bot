// services/ai/memoryRouter.js
// ════════════════════════════════════════════════════════════════════════
// 🧠 Memory Engine — Router independiente y aislado del Chat Engine.
// Utiliza sus propias API Keys y modelos dedicados para tareas de memoria
// (detección de temas, resúmenes, extracción de perfil, clasificación).
// NUNCA usa las llaves del Chat Engine (GROQ_API_KEY, GEMINI_API_KEY, etc).
// ════════════════════════════════════════════════════════════════════════

import secrets from '../../secrets.js';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_COMPAT_PATH = '/v1/chat/completions'; // Ollama usa formato OpenAI

/**
 * Orden de prioridad para el Memory Router.
 * Intenta la key más rápida primero, luego rota.
 */
function getMemoryProviders() {
  const cfg = secrets.getMemoryConfig();
  const providers = [];

  if (cfg.groqKey1) providers.push({ name: 'groq-mem-1', type: 'groq', apiKey: cfg.groqKey1 });
  if (cfg.groqKey2) providers.push({ name: 'groq-mem-2', type: 'groq', apiKey: cfg.groqKey2 });
  if (cfg.openrouterKey) providers.push({ name: 'openrouter-mem', type: 'openrouter', apiKey: cfg.openrouterKey });
  if (cfg.geminiKey) providers.push({ name: 'gemini-mem', type: 'gemini', apiKey: cfg.geminiKey });
  if (cfg.ollamaUrl) providers.push({ name: 'ollama-mem', type: 'ollama', url: cfg.ollamaUrl });

  return providers;
}

/**
 * Llamada genérica a Groq (formato OpenAI).
 */
async function callGroq(apiKey, model, messages, temperature = 0.3) {
  // Traducir alias a nombres reales de Groq
  const groqModelMap = {
    'llama-3.1-8b': 'llama-3.1-8b-instant',
    'llama-3.3-70b': 'llama-3.3-70b-versatile',
    'gemma-3': 'gemma2-9b-it'
  };
  const targetModel = groqModelMap[model] || model;

  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: targetModel, messages, temperature, max_tokens: 2048 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

/**
 * Llamada a OpenRouter (ideal para modelos libres/free).
 */
async function callOpenRouter(apiKey, model, messages, temperature = 0.3) {
  const orModelMap = {
    'llama-3.1-8b': 'meta-llama/llama-3.1-8b-instruct:free',
    'llama-3.3-70b': 'meta-llama/llama-3.3-70b-instruct:free',
    'gemma-3': 'google/gemma-2-9b-it:free'
  };
  const targetModel = orModelMap[model] || model;

  const res = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/mauriciosalu2gg-jpg/aero-discord-bot',
      'X-Title': 'Aero Memory Engine'
    },
    body: JSON.stringify({ model: targetModel, messages, temperature, max_tokens: 2048 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

/**
 * Llamada genérica a Gemini REST.
 */
async function callGemini(apiKey, model, messages, temperature = 0.3) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  
  const geminiModel = model.startsWith('gemini') ? model : 'gemini-2.0-flash';
  const url = `${GEMINI_API}/${geminiModel}:generateContent?key=${apiKey}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Llamada genérica a Ollama (formato OpenAI compatible).
 */
async function callOllama(baseUrl, model, messages, temperature = 0.3) {
  const url = `${baseUrl.replace(/\/$/, '')}${OPENAI_COMPAT_PATH}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, stream: false }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

/**
 * Ejecuta una petición al Memory Engine con fallback automático entre proveedores.
 */
export async function askMemoryEngine(task, messages, temperature = 0.3) {
  const cfg = secrets.getMemoryConfig();
  if (!cfg.enabled) {
    throw new Error('[MemoryEngine] MEMORY_ENABLED no está activado.');
  }

  const modelMap = {
    topic: cfg.topicModel || 'llama-3.1-8b',
    summary: cfg.summaryModel || 'llama-3.3-70b',
    profile: cfg.profileModel || 'gemma-3',
  };
  const model = modelMap[task] || modelMap.summary;
  const providers = getMemoryProviders();

  if (providers.length === 0) {
    throw new Error('[MemoryEngine] No hay proveedores de memoria configurados (MEMORY_GROQ_KEY_1, MEMORY_OPENROUTER_KEY, etc).');
  }

  const errors = [];
  for (const provider of providers) {
    try {
      let result;
      switch (provider.type) {
        case 'groq':
          result = await callGroq(provider.apiKey, model, messages, temperature);
          break;
        case 'openrouter':
          result = await callOpenRouter(provider.apiKey, model, messages, temperature);
          break;
        case 'gemini':
          result = await callGemini(provider.apiKey, model, messages, temperature);
          break;
        case 'ollama':
          result = await callOllama(provider.url, model, messages, temperature);
          break;
        default:
          continue;
      }
      if (result) {
        console.log(`[MemoryEngine] ✓ ${task} procesado con ${provider.name} (${model})`);
        return result;
      }
    } catch (err) {
      console.warn(`[MemoryEngine] ✗ ${provider.name} falló para ${task}: ${err.message}`);
      errors.push({ provider: provider.name, error: err.message });
    }
  }

  throw new Error(`[MemoryEngine] Todos los proveedores fallaron para "${task}": ${JSON.stringify(errors)}`);
}

/**
 * Verifica si el Memory Engine está habilitado y tiene al menos un proveedor.
 */
export function isMemoryEngineAvailable() {
  const cfg = secrets.getMemoryConfig();
  if (!cfg.enabled) return false;
  return !!(cfg.groqKey1 || cfg.groqKey2 || cfg.openrouterKey || cfg.geminiKey || cfg.ollamaUrl);
}

export default { askMemoryEngine, isMemoryEngineAvailable };
