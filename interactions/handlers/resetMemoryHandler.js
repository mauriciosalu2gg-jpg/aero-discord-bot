// interactions/handlers/resetMemoryHandler.js
import { resetUserMemory } from '../../core/memory/index.js';
import { getUserMemoryConfig, setUserMemoryConfig } from '../../core/memory/config.js';

export async function handleResetMemoryCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  if (sub === 'borrar_canal' || sub === 'borrar_server') {
    const config = await getUserMemoryConfig(userId);
    await resetUserMemory(userId, guildId, config.mode);
    await interaction.editReply({ content: 'listo, he olvidado todo tu historial en este modo ✅' });
    return true;
  }

  if (sub === 'modo') {
    const mode = interaction.options.getString('modo');
    const config = await getUserMemoryConfig(userId);
    config.mode = mode;
    await setUserMemoryConfig(userId, config);
    await interaction.editReply({ content: `Modo de memoria cambiado a **${mode}**. ✅` });
    return true;
  }

  if (sub === 'perfil') {
    const config = await getUserMemoryConfig(userId);
    const nombre = interaction.options.getString('nombre');
    const pronombres = interaction.options.getString('pronombres');
    const preferencias = interaction.options.getString('preferencias');
    const instrucciones = interaction.options.getString('instrucciones');

    if (nombre) config.profile.preferredName = nombre;
    if (pronombres) config.profile.pronouns = pronombres;
    if (preferencias) config.profile.preferences = preferencias;
    if (instrucciones) config.profile.instructions = instrucciones;

    await setUserMemoryConfig(userId, config);
    await interaction.editReply({ content: 'Tu perfil de memoria global ha sido actualizado ✅' });
    return true;
  }

  return false;
}

export default { handleResetMemoryCommand };
