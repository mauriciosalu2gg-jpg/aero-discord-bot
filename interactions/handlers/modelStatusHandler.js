// interactions/handlers/modelStatusHandler.js
// /bot ai status: panel visual (embed) con que compania y modelo esta
// corriendo ahora mismo, que otras companias estan sanas y listas para
// tomar la posta, y los tokens gastados en ESTE servidor en particular +
// el total acumulado en todos los servidores (Firestore).
import { EmbedBuilder } from 'discord.js';
import secrets from '../../secrets.js';
import { getActiveProvider, getAllSnapshots } from '../../services/ai/providerHealth.js';
import { getGuildTokenUsage, getGlobalTokenUsage } from '../../core/memory/index.js';

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
  ollama: 'Ollama (local)',
  lmstudio: 'LM Studio (local)',
};

const COLORS = {
  healthy: 0x57F287,
  degraded: 0xFEE75C,
  offline: 0x2B2D31,
};

// Mismo criterio visual que /bot ai providers, para que ambos comandos se
// vean consistentes (un proveedor "Rate Limited" se ve igual en los dos).
const STATUS_EMOJI = {
  Healthy: '🟢',
  Slow: '🟡',
  'Rate Limited': '🟠',
  'Quota Exceeded': '🔴',
  Offline: '⚫',
  Unavailable: '⛔',
};

function displayName(name) {
  return PROVIDER_DISPLAY_NAMES[name] || name;
}

function fmtTokens(n) {
  return (n || 0).toLocaleString('es-419');
}

export async function handleModelStatusCommand(interaction) {
  await interaction.deferReply();

  const active = getActiveProvider();
  const configured = new Set(secrets.getAvailableProviders().map(p => p.name));
  const providerNames = secrets.PROVIDER_PRIORITY.filter(name => configured.has(name));
  const snapshots = getAllSnapshots(providerNames);

  // Ahora separamos los backups en sanos vs con problemas, y a los con
  // problemas les mostramos el emoji de SU estado real (no un generico
  // "en cooldown") + cuanto les falta para recuperarse.
  const backups = snapshots.filter(s => !active || s.name !== active.name);
  const healthyBackups = backups.filter(s => s.status === 'Healthy' && !s.onCooldown);
  const troubledBackups = backups.filter(s => !(s.status === 'Healthy' && !s.onCooldown));

  const embed = new EmbedBuilder()
    .setColor(active ? COLORS.healthy : COLORS.offline)
    .setTitle('🤖 Estado del cerebro')
    .setTimestamp();

  if (active) {
    const activeSnap = snapshots.find(s => s.name === active.name);
    const activeEmoji = activeSnap ? (STATUS_EMOJI[activeSnap.status] || '🟢') : '🟢';
    embed.setDescription(`${activeEmoji} Ahorita estoy corriendo con **${displayName(active.name)}**, modelo \`${active.model}\`.`);
  } else {
    embed.setColor(COLORS.degraded);
    embed.setDescription('⚪ _Todavía no hay un proveedor cacheado — se elige apenas mande el próximo mensaje._');
  }

  if (healthyBackups.length) {
    embed.addFields({
      name: '✅ Backups sanos y listos',
      value: healthyBackups.map(s => `🟢 ${displayName(s.name)}`).join('\n'),
      inline: true,
    });
  }

  if (troubledBackups.length) {
    embed.addFields({
      name: '⚠️ Backups con problemas',
      value: troubledBackups.map(s => {
        const emoji = STATUS_EMOJI[s.status] || '⚪';
        const remaining = s.onCooldown ? ` · vuelve en ${Math.max(1, Math.round(s.cooldownRemainingMs / 60000))} min` : '';
        return `${emoji} ${displayName(s.name)} — ${s.status}${remaining}`;
      }).join('\n'),
      inline: true,
    });
  }

  if (!healthyBackups.length && !troubledBackups.length) {
    embed.addFields({
      name: '⚠️ Sin fallback configurado',
      value: 'Agregá otra API Key en el `.env` (ej: `OPENROUTER_API_KEY`, que tiene modelos gratis).',
      inline: false,
    });
  }

  if (troubledBackups.length) {
    embed.addFields({
      name: 'ℹ️ Mas detalle',
      value: 'Usa `/bot ai providers` para ver latencia, tasa de exito y ultimo error de cada uno.',
      inline: false,
    });
  }

  const guildTokens = interaction.guildId ? await getGuildTokenUsage(interaction.guildId) : 0;
  const globalTokens = await getGlobalTokenUsage();

  const tokenFields = [];
  if (interaction.guildId) {
    tokenFields.push({ name: '📊 Tokens (este servidor)', value: `**${fmtTokens(guildTokens)}**`, inline: true });
  }
  tokenFields.push({ name: '🌐 Tokens (todos los servidores)', value: `**${fmtTokens(globalTokens)}**`, inline: true });
  embed.addFields(...tokenFields);

  embed.setFooter({ text: `${providerNames.length} proveedor(es) configurado(s)` });

  await interaction.editReply({ embeds: [embed] });
  return true;
}

export default { handleModelStatusCommand };
