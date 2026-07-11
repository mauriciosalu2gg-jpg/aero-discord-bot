// interactions/handlers/resetMemoryHandler.js
import { resetMemory, resetGuildMemory, resetAllMemory } from '../../core/memory.js';
import { isOwner } from '../../core/permissions.js';

export async function handleResetMemoryCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  await interaction.deferReply();

  if (sub === 'channel') {
    await resetMemory(interaction.channelId, guildId);
    await interaction.editReply({ content: 'listo, memoria de este canal reseteada 🫡' });
    return true;
  }

  if (sub === 'server') {
    await resetGuildMemory(guildId);
    await interaction.editReply({ content: 'listo, memoria de todo este servidor reseteada ✅' });
    return true;
  }

  if (sub === 'all') {
    if (!isOwner(interaction.user)) {
      await interaction.editReply({ content: 'eso solo lo puede hacer Lara' });
      return true;
    }
    await resetAllMemory();
    await interaction.editReply({ content: 'memoria de TODOS los servidores reseteada ✅' });
    return true;
  }

  return false;
}

export default { handleResetMemoryCommand };
