// interactions/handlers/providerStatusHandler.js
// /provider -> version slash command del viejo !provider (texto). Muestra
// el estado completo del orquestador de IA: proveedor activo, modelo, y
// para cada proveedor CONFIGURADO (con API Key en el .env) su salud,
// cooldown restante y latencia promedio. Disponible para cualquiera
// (solo lectura, no cambia nada).
import secrets from '../../secrets.js';
import { getActiveProvider, getAllSnapshots } from '../../services/ai/providerHealth.js';

const STATUS_EMOJI = {
  Healthy: '🟢',
  Slow: '🟡',
  'Rate Limited': '🟠',
  'Quota Exceeded': '🔴',
  Offline: '⚫',
};

const PROVIDER_DISPLAY_NAMES = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  cerebras: 'Cerebras',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
  mistral: 'Mistral',
  cohere: 'Cohere',
};

function displayName(name) {
  return PROVIDER_DISPLAY_NAMES[name] || name;
}

function fmtMs(ms) {
  if (!ms || ms <= 0) return '—';
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 1000)}s`;
}

function fmtWhen(ts) {
  if (!ts) return 'nunca';
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return `hace ${diffSec}s`;
  if (diffSec < 3600) return `hace ${Math.round(diffSec / 60)} min`;
  return `hace ${Math.round(diffSec / 3600)}h`;
}

export async function handleProviderStatusCommand(interaction) {
  await interaction.deferReply();

  const configuredProviders = secrets.getAvailableProviders();
  const configuredNames = configuredProviders.map(p => p.name);
  const missingNames = secrets.PROVIDER_PRIORITY.filter(name => !configuredNames.includes(name));

  const snapshots = getAllSnapshots(configuredNames);
  const active = getActiveProvider();

  const lines = [];
  lines.push('**🧠 Estado del orquestador de IA**');
  lines.push(
    active
      ? `**Proveedor activo:** ${displayName(active.name)}  |  **Modelo:** \`${active.model || '—'}\``
      : '**Proveedor activo:** ninguno cacheado (se elegira en el proximo mensaje)'
  );
  lines.push('');

  if (!snapshots.length) {
    lines.push('_No hay ningun proveedor con API Key configurada. Agrega al menos una en el .env (ej: OPENROUTER_API_KEY, GROQ_API_KEY)._');
  } else {
    lines.push('**Configurados (con API Key):**');
    for (const snap of snapshots) {
      const emoji = STATUS_EMOJI[snap.status] || '⚪';
      const cooldown = snap.onCooldown ? `⏳ cooldown ${fmtMs(snap.cooldownRemainingMs)}` : 'listo';
      const avgLatency = snap.averageLatencyMs ? `${snap.averageLatencyMs} ms` : '—';

      lines.push(
        `${emoji} **${displayName(snap.name)}** — ${snap.status} (${cooldown})\n` +
        `   ↳ usos: ${snap.timesUsed} | errores: ${snap.errors} | latencia prom: ${avgLatency}\n` +
        `   ↳ ultimo exito: ${fmtWhen(snap.lastSuccessAt)} | ultimo fallo: ${fmtWhen(snap.lastErrorAt)}` +
        (snap.lastError ? ` (${snap.lastError})` : '')
      );
    }
  }

  if (missingNames.length) {
    lines.push('');
    lines.push(`_Sin API Key configurada (no se usan): ${missingNames.map(displayName).join(', ')}_`);
  }

  await interaction.editReply({ content: lines.join('\n') });
  return true;
}

export default { handleProviderStatusCommand };
