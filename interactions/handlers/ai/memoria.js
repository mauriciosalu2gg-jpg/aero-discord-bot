import { resetUserMemory } from '../../../core/memory/index.js';
import { getUserMemoryConfig, setUserMemoryConfig } from '../../../core/memory/config.js';
import { isOwner } from '../../../core/permissions.js';

export async function handleMemoria(interaction, action, value) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (action === 'limpiar') {
    if (userId !== '971639277626720268' && !isOwner(interaction.user) && userId !== process.env.OWNER_DISCORD_ID) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⏳ No tienes permisos para limpiar la memoria. Solo Lara puede hacerlo.', ephemeral: true });
      } else {
        await interaction.followUp({ content: '⏳ No tienes permisos para limpiar la memoria. Solo Lara puede hacerlo.', ephemeral: true });
      }
      return;
    }
    const config = await getUserMemoryConfig(userId);
    await resetUserMemory(userId, guildId, config.mode, interaction.channelId);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '✅ Memoria limpiada exitosamente.', ephemeral: true });
    }
    return;
  }

  if (action === 'modo') {
    const config = await getUserMemoryConfig(userId);
    config.mode = value;
    await setUserMemoryConfig(userId, config);
    return;
  }
}
