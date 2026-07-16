import { setModerationActive } from '../../core/moderation/index.js';

export async function handleModerationCommand(interaction) {
  const activar = interaction.options.getBoolean('activar');
  const guildId = interaction.guildId;

  if (!guildId) {
    return interaction.reply({ content: 'Este comando solo se puede usar en un servidor.', ephemeral: true });
  }

  try {
    await setModerationActive(guildId, activar);
    return interaction.reply({
      content: `La automoderación ha sido **${activar ? 'activada' : 'desactivada'}** en este servidor.`,
      ephemeral: true
    });
  } catch (err) {
    console.error('[moderationHandler] Error:', err);
    return interaction.reply({ content: 'Error al actualizar la configuración de moderación.', ephemeral: true });
  }
}

export default { handleModerationCommand };

