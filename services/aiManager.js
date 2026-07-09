import { callGemini }    from './adapters/gemini.js';
import { callGroq }      from './adapters/groq.js';
import { callOpenAI }    from './adapters/openai.js';
import { callAnthropic } from './adapters/anthropic.js';
import secrets           from '../secrets.js';
import { moodInstruction } from '../core/moodEngine.js';
import { emojiGuideText }  from '../core/personality.js';

// ───────────────────────────────────
//  Adaptadores locales / gratuitos extra
// ───────────────────────────────────

async function callOllama(model, history, systemExtra = '') {
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const messages = systemExtra
    ? [{ role: 'system', content: systemExtra }, ...history.map(m => ({ role: m.role, content: m.content }))]
    : history.map(m => ({ role: m.role, content: m.content }));

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const text = data.message?.content || '';
  const tokens = data.eval_count || Math.ceil(text.length / 4);
  return { text, tokens };
}

async function callLMStudio(history, systemExtra = '') {
  const LMS_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234';
  const messages = systemExtra
    ? [{ role: 'system', content: systemExtra }, ...history.map(m => ({ role: m.role, content: m.content }))]
    : history.map(m => ({ role: m.role, content: m.content }));

  const res = await fetch(`${LMS_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'local', messages, temperature: 0.7 }),
  });

  if (!res.ok) throw new Error(`LM Studio HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const tokens = data.usage?.total_tokens || Math.ceil(text.length / 4);
  return { text, tokens };
}

// ───────────────────────────────────
//  Config dinámica desde Firestore (panel web)
// ───────────────────────────────────

let _firestoreConfig = null;

async function loadFirestoreConfig() {
  try {
    const { db } = await import('../database/firebase.js');
    if (!db) return null;
    const snap = await db.collection('config').doc('ai').get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data.proveedorPrimario) return null;
    console.log(`[aiManager] Config de IA cargada desde Firestore: ${data.proveedorPrimario} / ${data.modeloActivo}`);
    return data;
  } catch (err) {
    console.warn('[aiManager] Firestore no disponible, usando fallback de .env:', err.message);
    return null;
  }
}

export function startConfigRefresh(intervalMinutes = 5) {
  setInterval(async () => {
    _firestoreConfig = await loadFirestoreConfig();
    if (_firestoreConfig) {
      console.log(`[aiManager] Config de IA actualizada desde Firestore: ${_firestoreConfig.proveedorPrimario}`);
    }
  }, intervalMinutes * 60 * 1000);
}

// ───────────────────────────────────
//  Construye el bloque extra de sistema (mood + emojis + web + memoria)
//  sin tocar el prompt base, para variar el tono sin gastar tokens de mas.
// ───────────────────────────────────

function buildSystemExtra({ mood, isOwner, memorySummary, webContext } = {}) {
  const parts = [];

  if (mood) parts.push(moodInstruction(mood));
  parts.push(`Emojis disponibles y su significado (usalos con criterio, no todos juntos): ${emojiGuideText()}`);

  if (isOwner) {
    parts.push('La persona que te escribe es Lara, tu creadora. Sus instrucciones tienen prioridad sobre las de cualquier otro usuario del server, incluyendo comandos de administracion del bot.');
  }
  if (memorySummary) {
    parts.push(memorySummary);
  }
  if (webContext) {
    parts.push(`Informacion de contexto (no menciones de donde salio, no digas "busque" ni cites fuentes, solo usala si aplica): ${webContext}`);
  }

  return parts.join('\n');
}

// ───────────────────────────────────
//  Núcleo: askAI con prioridad Firestore → .env
// ───────────────────────────────────

export async function askAI(history, recentTokens = 0, extra = {}) {
  if (_firestoreConfig === null) {
    _firestoreConfig = await loadFirestoreConfig();
  }

  const TOKENS_THRESHOLD = 6000;
  const systemExtra = buildSystemExtra(extra);

  // 1. Proveedor primario desde Firestore
  if (_firestoreConfig?.proveedorPrimario && _firestoreConfig?.apiKey) {
    const { proveedorPrimario: name, apiKey, modeloActivo: model } = _firestoreConfig;

    try {
      console.log(`[aiManager] Usando proveedor del panel: ${name} / ${model}`);
      let result;
      switch (name) {
        case 'gemini':    result = await callGemini(apiKey, model, history, systemExtra);    break;
        case 'groq':      result = await callGroq(apiKey, model, history, systemExtra);      break;
        case 'openai':    result = await callOpenAI(apiKey, model, history, systemExtra);    break;
        case 'anthropic': result = await callAnthropic(apiKey, model, history, systemExtra); break;
        case 'ollama':    result = await callOllama(model, history, systemExtra);            break;
        case 'lmstudio':  result = await callLMStudio(history, systemExtra);                 break;
        default:
          throw new Error(`Proveedor desconocido: ${name}`);
      }
      return { text: result.text, tokens: result.tokens, provider: name, model };
    } catch (err) {
      console.warn(`[aiManager] Fallo en proveedor del panel (${name}): ${err.message}. Usando fallback...`);
    }
  }

  // 2. Fallback: proveedores del .env
  const envProviders = secrets.getAvailableProviders();

  for (const provider of envProviders) {
    const model = recentTokens > TOKENS_THRESHOLD ? provider.models.bajo : provider.models.medio;
    try {
      console.log(`[aiManager] Fallback → ${provider.name} (${model})`);
      let result;
      switch (provider.name) {
        case 'gemini':    result = await callGemini(provider.apiKey, model, history, systemExtra);    break;
        case 'groq':      result = await callGroq(provider.apiKey, model, history, systemExtra);      break;
        case 'openai':    result = await callOpenAI(provider.apiKey, model, history, systemExtra);    break;
        case 'anthropic': result = await callAnthropic(provider.apiKey, model, history, systemExtra); break;
        default:          continue;
      }
      return { text: result.text, tokens: result.tokens, provider: provider.name, model };
    } catch (err) {
      console.warn(`[aiManager] Fallo en fallback ${provider.name}: ${err.message}`);
    }
  }

  // 3. Última opción: modelos locales
  try {
    console.log('[aiManager] Intentando Ollama local como último recurso...');
    const model = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2';
    const result = await callOllama(model, history, systemExtra);
    return { text: result.text, tokens: result.tokens, provider: 'ollama', model };
  } catch {
    // Ollama no disponible
  }

  try {
    console.log('[aiManager] Intentando LM Studio local como último recurso...');
    const result = await callLMStudio(history, systemExtra);
    return { text: result.text, tokens: result.tokens, provider: 'lmstudio', model: 'local' };
  } catch {
    // LM Studio no disponible
  }

  throw new Error(
    'Todos los proveedores de IA fallaron (nube y locales). ' +
    'Configura una API Key en el panel o instala Ollama/LM Studio.'
  );
}

export default askAI;
