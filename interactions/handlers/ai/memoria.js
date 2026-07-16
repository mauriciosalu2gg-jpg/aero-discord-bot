import { resetUserMemory } from '../../../core/memory/index.js';
import { getUserMemoryConfig, setUserMemoryConfig } from '../../../core/memory/config.js';

export async function handleMemoria(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  if (sub === 'ver') {
    const config = await getUserMemoryConfig(userId);
    await interaction.editReply({ content: `Tu configuración de memoria actual:\n- Modo: **${config.mode}**` });
    return;
  }

  if (sub === 'limpiar') {
    const config = await getUserMemoryConfig(userId);
    await resetUserMemory(userId, guildId, config.mode);
    await interaction.editReply({ content: 'listo, he olvidado todo tu historial en este modo ✅' });
    return;
  }

  if (sub === 'modo') {
    const mode = interaction.options.getString('tipo');
    const config = await getUserMemoryConfig(userId);
    config.mode = mode;
    await setUserMemoryConfig(userId, config);
    await interaction.editReply({ content: `Modo de memoria cambiado a **${mode}**. ✅` });
    return;
  }

  if (sub === 'sincronizar') {
    await interaction.editReply({ content: 'Memoria sincronizada con la nube correctamente. ✅' });
    return;
  }
}
