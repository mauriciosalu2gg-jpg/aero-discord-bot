// commands/apikey.js
// Cuando Lara o Gio le preguntan al bot directamente que modelo o compañia
// de IA esta usando, el bot esta OBLIGADO a contestar con datos reales
// (proveedor/compañia, modelo activo, tokens gastados en este server).
// Nunca se menciona la api key en si (ni para decir que es secreta ni nada
// por el estilo), directamente se contesta la parte util: que compañia y
// que modelo, como algo normal, sin rodeos ni excusas de seguridad.

import { isCreatorOrSubCreator } from '../core/permissions.js';
import { getActiveProvider, getAllSnapshots } from '../services/ai/providerHealth.js';
import secrets from '../secrets.js';

// Nombres "humanos" de cada proveedor, para que la respuesta suene natural
// ("estoy usando Groq") en vez del nombre tecnico interno.
const PROVIDER_DISPLAY_NAMES = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  cerebras: 'Cerebras',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
  ollama: 'Ollama (local)',
  lmstudio: 'LM Studio (local)',
};

function displayName(providerName) {
  return PROVIDER_DISPLAY_NAMES[providerName] || providerName;
}

// Regex flexibles en vez de frases exactas, para cubrir variantes como
// "que modelo usas", "que compañia usas", "con que estas corriendo", etc.
// sin tener que listar cada combinacion posible a mano.
const TRIGGER_PATTERNS = [
  /\b(que|cual)\s+(modelo|ia|proveedor|compa[nñ]ia|compa[nñ]ía)\b.*\b(usas|usando|corriendo|estas)\b/,
  /\bcon\s+que\s+(modelo|ia|compa[nñ]ia|compa[nñ]ía)\b.*\b(corriendo|estas)\b/,
  /\b(groq|openai|gemini|anthropic|claude|cerebras|openrouter)\b.*\b(usas|usando|estas usando)\b/,
  /\bcuantos?\s+tokens?\b.*\b(gastad|gastaste|llevas|has gastado)\b/,
  /\btokens?\s+(gastados|gastaste|has gastado)\b/,
];

export function mentionsApiKeyTopic(content) {
  const lower = (content || '').toLowerCase();
  return TRIGGER_PATTERNS.some(re => re.test(lower));
}

/**
 * Arma la respuesta forzada con info real del sistema. Se usa como override
 * directo (no pasa por el modelo de IA) para que la info sea siempre exacta,
 * nunca alucinada. Solo menciona compañia/modelo/tokens, nunca la api key.
 */
export async function buildForcedStatusReply(guildTokensUsedTotal = null) {
  const active = getActiveProvider();
  const providerNames = secrets.PROVIDER_PRIORITY;
  const snapshots = getAllSnapshots(providerNames);

  const lines = [];

  if (active) {
    lines.push(`ahorita estoy corriendo con **${displayName(active.name)}**${active.model ? `, modelo **${active.model}**` : ''}`);
  } else {
    lines.push('todavia no hay un proveedor cacheado, se elige apenas mande el proximo mensaje');
  }

  const healthy = snapshots.filter(s => s.status === 'Healthy').map(s => displayName(s.name));
  if (healthy.length) lines.push(`otras compañias sanas ahora mismo por si toca cambiar: ${healthy.join(', ')}`);

  if (typeof guildTokensUsedTotal === 'number') {
    lines.push(`tokens gastados en total en este server: **${guildTokensUsedTotal.toLocaleString('es-419')}**`);
  }

  return lines.join('\n');
}

/**
 * Maneja el mensaje si Lara o Gio preguntan directamente por esto. Devuelve
 * true si ya respondio (para que index.js no siga al flujo normal de IA).
 */
export async function handleApiKeyQuestion(message, guildTokensUsedTotal) {
  if (!mentionsApiKeyTopic(message.content)) return false;
  if (!isCreatorOrSubCreator(message.author)) return false; // otros usuarios no tienen por que saber esto

  const reply = await buildForcedStatusReply(guildTokensUsedTotal);
  await message.reply(reply);
  return true;
}

export default { mentionsApiKeyTopic, buildForcedStatusReply, handleApiKeyQuestion };
