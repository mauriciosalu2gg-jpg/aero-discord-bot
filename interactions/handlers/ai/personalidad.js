import { getUserMemoryConfig, setUserMemoryConfig } from '../../../core/memory/config.js';

export async function handlePersonalidad(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  const config = await getUserMemoryConfig(userId);

  if (sub === 'ver') {
    const nombre = config.profile?.preferredName || 'No definido';
    await interaction.editReply({ content: `**Personalidad configurada:**\nNombre preferido: **${nombre}**` });
    return;
  }

  if (sub === 'restablecer') {
    config.profile.preferredName = null;
    await setUserMemoryConfig(userId, config);
    await interaction.editReply({ content: 'Tu personalidad ha sido restablecida a los valores por defecto. ✅' });
    return;
  }

  if (sub === 'editar') {
    const nombre = interaction.options.getString('nombre');
    if (nombre) config.profile.preferredName = nombre;
    
    await setUserMemoryConfig(userId, config);
    await interaction.editReply({ content: 'Tu perfil de personalidad ha sido actualizado ✅' });
    return;
  }
}
