// interactions/handlers/providerStatusHandler.js
// /bot ai providers -> panel visual (embed) del estado completo del
// orquestador de IA: proveedor activo, modelo, y para cada proveedor
// CONFIGURADO (con API Key en el .env) su salud, cooldown restante y
// latencia promedio. Disponible para cualquiera (solo lectura).
import { EmbedBuilder } from 'discord.js';
import secrets from '../../secrets.js';
import { getActiveProvider, getAllSnapshots, getForcedProvider } from '../../services/ai/providerHealth.js';

const COLORS = {
  healthy: 0x57F287,
  degraded: 0xFEE75C,
  critical: 0xED4245,
  offline: 0x2B2D31,
};

// Un solo lugar con todo lo visual por estado: emoji, color propio del
// estado (distinto del color general del embed), y que tan "lleno" se ve
// en la barra (0 a 5). Antes la barra era un string fijo por status y no
// reflejaba nada real; ahora se recalcula segun cooldown restante real.
const STATUS_META = {
  Healthy:          { emoji: '🟢', label: 'Sano',            color: 0x57F287, fill: 5 },
  Slow:             { emoji: '🟡', label: 'Lento',           color: 0xFEE75C, fill: 4 },
  'Rate Limited':   { emoji: '🟠', label: 'Rate limited',    color: 0xE67E22, fill: 2 },
  'Quota Exceeded': { emoji: '🔴', label: 'Cuota agotada',   color: 0xED4245, fill: 1 },
  Offline:          { emoji: '⚫', label: 'Caído',           color: 0x99AAB5, fill: 0 },
  Unavailable:      { emoji: '⛔', label: 'No disponible',   color: 0x4E5058, fill: 0 },
};
const DEFAULT_META = { emoji: '⚪', label: 'Desconocido', color: 0x99AAB5, fill: 0 };

// Barra de progreso real: si esta en cooldown, el relleno baja segun cuanto
// falta respecto al cooldown total configurado para ese tipo de fallo (asi
// se ve visualmente cuanto le queda para recuperarse, no un valor fijo).
function renderBar(meta, snap) {
  const FULL = '🟩', MID = '🟨', LOW = '🟧', EMPTY = '⬜';
  let fill = meta.fill;
  if (snap.onCooldown && snap.cooldownRemainingMs > 0) {
    // Nunca completamente vacio mientras haya cooldown activo, para que se
    // note que no es "Offline puro" sino "recuperandose".
    fill = Math.max(1, fill);
  }
  const cell = fill >= 5 ? FULL : fill >= 3 ? FULL : fill >= 2 ? MID : fill >= 1 ? LOW : EMPTY;
  return cell.repeat(fill) + EMPTY.repeat(5 - fill);
}

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

function overallColor(snapshots) {
  if (!snapshots.length) return COLORS.offline;
  if (snapshots.some(s => s.status === 'Healthy' && !s.onCooldown)) return COLORS.healthy;
  if (snapshots.some(s => s.status === 'Slow' || s.status === 'Rate Limited')) return COLORS.degraded;
  return COLORS.critical;
}

export async function handleProviderStatusCommand(interaction) {
  await interaction.deferReply();

  const configuredProviders = secrets.getAvailableProviders();
  const configuredNames = configuredProviders.map(p => p.name);
  const missingNames = secrets.PROVIDER_PRIORITY.filter(name => !configuredNames.includes(name));

  const snapshots = getAllSnapshots(configuredNames);
  const active = getActiveProvider();
  const forced = getForcedProvider();

  // Resumen rapido arriba del todo: cuantos proveedores estan realmente
  // sanos ahora mismo vs en cooldown/caidos, para no tener que leer los
  // campos uno por uno para saber si hay un problema.
  const healthyCount = snapshots.filter(s => s.status === 'Healthy' && !s.onCooldown).length;
  const degradedCount = snapshots.length - healthyCount;

  const embed = new EmbedBuilder()
    .setColor(overallColor(snapshots))
    .setTitle('🧠 Orquestador de IA')
    .setDescription(
      (active
        ? `Corriendo con **${displayName(active.name)}** · modelo \`${active.model || '—'}\`\n`
        : '_Sin proveedor cacheado — se elegirá en el próximo mensaje._\n') +
      (snapshots.length
        ? `🟢 **${healthyCount}** sano(s)  ·  ⚠️ **${degradedCount}** con problemas  ·  📊 **${snapshots.length}** configurado(s)`
        : '')
    )
    .setTimestamp();

  if (forced) {
    embed.addFields({
      name: '🔒 Forzado manualmente',
      value: `${displayName(forced)} · usá \`/bot ai force auto\` para volver a la rotación normal.`,
      inline: false,
    });
  }

  if (!snapshots.length) {
    embed.addFields({
      name: 'Sin proveedores configurados',
      value: 'Agregá al menos una API Key en el `.env` (ej: `OPENROUTER_API_KEY`, `GROQ_API_KEY`).',
    });
  } else {
    // Sanos primero, despues degradados/caidos: asi lo urgente (lo que
    // esta mal) no se pierde abajo del todo si hay muchos proveedores.
    const sorted = [...snapshots].sort((a, b) => {
      const rank = s => (s.status === 'Healthy' && !s.onCooldown) ? 0 : s.onCooldown ? 1 : 2;
      return rank(a) - rank(b);
    });

    for (const snap of sorted) {
      const meta = STATUS_META[snap.status] || DEFAULT_META;
      const bar = renderBar(meta, snap);
      const cooldownLine = snap.onCooldown ? `⏳ recuperando en **${fmtMs(snap.cooldownRemainingMs)}**` : '✅ listo para usarse';
      const avgLatency = snap.averageLatencyMs ? `${snap.averageLatencyMs} ms` : '—';
      const isActive = active && active.name === snap.name;
      const successRate = snap.timesUsed + snap.errors > 0
        ? Math.round((snap.timesUsed / (snap.timesUsed + snap.errors)) * 100)
        : null;

      embed.addFields({
        name: `${meta.emoji} ${displayName(snap.name)}${isActive ? '  ⭐ ACTIVO' : ''}`,
        value:
          `${bar}  **${meta.label}**\n` +
          `${cooldownLine}  ·  latencia prom: **${avgLatency}**\n` +
          `usos: **${snap.timesUsed}**  ·  errores: **${snap.errors}**` +
          (successRate !== null ? `  ·  éxito: **${successRate}%**` : '') + '\n' +
          `último éxito: ${fmtWhen(snap.lastSuccessAt)}  ·  último fallo: ${fmtWhen(snap.lastErrorAt)}` +
          (snap.lastError ? `\n⚠️ _${snap.lastError}_` : ''),
        inline: false,
      });
    }
  }

  if (missingNames.length) {
    embed.addFields({
      name: 'Sin API Key (no se usan)',
      value: missingNames.map(displayName).join(', '),
      inline: false,
    });
  }

  embed.setFooter({ text: `${snapshots.length} proveedor(es) activo(s) de ${secrets.PROVIDER_PRIORITY.length} soportados` });

  await interaction.editReply({ embeds: [embed] });
  return true;
}

export default { handleProviderStatusCommand };
