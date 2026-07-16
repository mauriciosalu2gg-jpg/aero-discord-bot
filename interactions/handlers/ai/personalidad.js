import { getUserMemoryConfig, setUserMemoryConfig } from '../../../core/memory/config.js';

export async function handlePersonalidad(interaction, action, value) {
  const userId = interaction.user.id;
  const config = await getUserMemoryConfig(userId);

  if (action === 'ver') {
    const nombre = config.profile?.preferredName || 'No definido';
    await interaction.followUp({ content: `**Personalidad configurada:**\nNombre preferido: **${nombre}**` });
    return;
  }

  if (action === 'editar') {
    if (value) config.profile.preferredName = value;
    await setUserMemoryConfig(userId, config);
    return;
  }
}
