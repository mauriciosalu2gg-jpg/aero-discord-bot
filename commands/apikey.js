// commands/apikey.js
// Cuando Lara o Gio le preguntan al bot directamente que api key/modelo
// esta usando o cuantos tokens gasto, el bot esta OBLIGADO a contestar con
// datos reales (proveedor, modelo activo, tokens gastados en este server).
// La API Key en si NUNCA se muestra completa por seguridad, solo el nombre
// del proveedor y modelo, que es lo que realmente importa para debug.

import { isCreatorOrSubCreator } from '../core/permissions.js';
import { getActiveProvider, getAllSnapshots } from '../services/ai/providerHealth.js';
import secrets from '../secrets.js';

const TRIGGERS = [
  'que api key usas', 'que api usas', 'dime que api key usas',
  'dime que api usas', 'que modelo usas', 'que modelo estas usando',
  'que ia usas', 'que ia estas usando', 'cuantos tokens has gastado',
  'cuantos tokens gastaste', 'cuantos tokens llevas', 'que proveedor usas',
  'que proveedor estas usando', 'con que api estas corriendo',
  'con que modelo estas corriendo',
];

export function mentionsApiKeyTopic(content) {
  const lower = (content || '').toLowerCase();
  return TRIGGERS.some(t => lower.includes(t));
}

/**
 * Arma la respuesta forzada con info real del sistema. Se usa como override
 * directo (no pasa por el modelo de IA) para que la info sea siempre exacta,
 * nunca alucinada.
 */
export async function buildForcedStatusReply(guildTokensUsedTotal = null) {
  const active = getActiveProvider();
  const providerNames = secrets.PROVIDER_PRIORITY;
  const snapshots = getAllSnapshots(providerNames);

  const lines = [];
  lines.push('dale, te digo la posta:');
  lines.push(
    active
      ? `- proveedor activo ahora: **${active.name}**`
      : '- proveedor activo: todavia no hay uno cacheado, se elige en el proximo mensaje'
  );
  if (active?.model) lines.push(`- modelo activo: **${active.model}**`);

  const healthy = snapshots.filter(s => s.status === 'Healthy').map(s => s.name);
  if (healthy.length) lines.push(`- proveedores sanos ahora mismo: ${healthy.join(', ')}`);

  if (typeof guildTokensUsedTotal === 'number') {
    lines.push(`- tokens gastados en total en este server: **${guildTokensUsedTotal.toLocaleString('es-419')}**`);
  }

  lines.push('la api key en si no te la puedo tirar completa aca por seguridad, pero eso es todo lo demas 🫡');

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
