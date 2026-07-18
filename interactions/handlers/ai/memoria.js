import { resetUserMemory } from '../../../core/memory/index.js';
import { getUserMemoryConfig, setUserMemoryConfig } from '../../../core/memory/config.js';

export async function handleMemoria(interaction, action, value) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (action === 'limpiar') {
    const config = await getUserMemoryConfig(userId);
    await resetUserMemory(userId, guildId, config.mode, interaction.channelId);
    return;
  }

  if (action === 'modo') {
    const config = await getUserMemoryConfig(userId);
    config.mode = value;
    await setUserMemoryConfig(userId, config);
    return;
  }
}
