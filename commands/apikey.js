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

// Regex mas estrictos: antes disparaban con cualquier frase que
// combinara "modelo/ia/compañia" + "usando/estas", lo cual generaba falsos
// positivos con charla normal sin relacion a IA (ej: "que modelo de auto
// estas usando", "con que compañia andas de celular"). Ahora exigen
// vocabulario especifico de IA/tokens junto a la pregunta, no generico.
const TRIGGER_PATTERNS = [
  /\b(que|cual)\s+(modelo|proveedor)\s+de\s+ia\b/,
  /\b(que|cual)\s+ia\b.*\b(usas|usando|corriendo|estas)\b/,
  /\bcon\s+que\s+ia\b.*\b(corriendo|estas|andas)\b/,
  /\b(groq|openai|gemini|anthropic|claude|cerebras|openrouter|mistral|cohere|huggingface)\b.*\b(usas|usando|estas usando|activo|corriendo)\b/,
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
  const configured = new Set(secrets.getAvailableProviders().map(p => p.name));
  const providerNames = secrets.PROVIDER_PRIORITY.filter(name => configured.has(name));
  const snapshots = getAllSnapshots(providerNames);

  const lines = [];

  if (active) {
    lines.push(`ahorita estoy corriendo con **${displayName(active.name)}**${active.model ? `, modelo **${active.model}**` : ''}`);
  } else {
    lines.push('todavia no hay un proveedor cacheado, se elige apenas mande el proximo mensaje');
  }

  const healthy = snapshots
    .filter(s => s.status === 'Healthy' && (!active || s.name !== active.name))
    .map(s => displayName(s.name));
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
