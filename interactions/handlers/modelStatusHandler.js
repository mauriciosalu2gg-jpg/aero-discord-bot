// interactions/handlers/modelStatusHandler.js
// /modelstatus (reemplaza al viejo /fluxerstatus): le dice a Lara/Gio con
// que compania y modelo esta corriendo ahora mismo, que otras companias
// estan sanas y listas para tomar la posta, y los tokens gastados en ESTE
// servidor en particular + el total acumulado en todos los servidores
// (Firestore).
import secrets from '../../secrets.js';
import { getActiveProvider, getAllSnapshots } from '../../services/ai/providerHealth.js';
import { getGuildTokenUsage, getGlobalTokenUsage } from '../../core/memory.js';

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

function displayName(name) {
  return PROVIDER_DISPLAY_NAMES[name] || name;
}

export async function handleModelStatusCommand(interaction) {
  await interaction.deferReply();

  const active = getActiveProvider();
  const providerNames = secrets.PROVIDER_PRIORITY;
  const snapshots = getAllSnapshots(providerNames);

  const lines = [];

  if (active) {
    lines.push(`Ahorita estoy corriendo con **${displayName(active.name)}**, usando su modelo **\`${active.model}\`**.`);
  } else {
    lines.push('Todavia no hay un proveedor cacheado, se elige apenas mande el proximo mensaje.');
  }

  const healthy = snapshots
    .filter(s => s.status === 'Healthy' && (!active || s.name !== active.name))
    .map(s => displayName(s.name));

  if (healthy.length) {
    lines.push(`Las otras companias sanas que estan listas para usarse son: ${healthy.join(', ')}.`);
  } else {
    lines.push('No hay otras companias sanas ahora mismo (o son las unicas con API Key configurada).');
  }

  const guildTokens = interaction.guildId ? await getGuildTokenUsage(interaction.guildId) : 0;
  const globalTokens = await getGlobalTokenUsage();

  lines.push('');
  if (interaction.guildId) {
    lines.push(`Tokens gastados en **este servidor**: **${guildTokens.toLocaleString('es-419')}**`);
  }
  lines.push(`Tokens gastados en total (todos los servidores): **${globalTokens.toLocaleString('es-419')}**`);

  await interaction.editReply({ content: lines.join('\n') });
  return true;
}

export default { handleModelStatusCommand };
