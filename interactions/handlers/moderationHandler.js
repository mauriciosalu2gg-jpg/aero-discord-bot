import { setModerationActive } from '../../core/moderation/index.js';

export async function handleModerationCommand(interaction) {
  const activar = interaction.options.getBoolean('activar');
  const guildId = interaction.guildId;

  if (!guildId) {
    return interaction.reply({ content: 'Este comando solo se puede usar en un servidor.', ephemeral: true });
  }

  try {
    let durationMs = 0;
    let replyMsg = '';

    if (activar) {
      const horas = interaction.options.getInteger('horas');
      const dias = interaction.options.getInteger('dias');

      if (horas || dias) {
        durationMs = ((horas || 0) * 60 * 60 * 1000) + ((dias || 0) * 24 * 60 * 60 * 1000);
        const totalHoras = durationMs / (60 * 60 * 1000);
        replyMsg = `La automoderación ha sido **activada** de forma temporal por **${totalHoras} horas** en todos los canales. 🛡️\n*(Descansará 10 horas si no hay infracciones al finalizar el ciclo)*`;
      } else {
        // Por defecto 24 horas si no especifican nada
        durationMs = 24 * 60 * 60 * 1000;
        replyMsg = `La automoderación ha sido **activada** por defecto durante **24 horas** en todos los canales. 🛡️\n*(Descansará 10 horas si no hay infracciones al finalizar el ciclo)*`;
      }
    } else {
      replyMsg = 'La automoderación ha sido **desactivada** en este servidor.';
    }

    await setModerationActive(guildId, activar, durationMs, interaction.channelId, interaction.user.id);
    return interaction.reply({
      content: replyMsg,
      ephemeral: false // Dejarlo visible para que todo el staff y moders vean el anuncio de activación
    });
  } catch (err) {
    console.error('[moderationHandler] Error:', err);
    return interaction.reply({ content: 'Error al actualizar la configuración de moderación.', ephemeral: true });
  }
}

export default { handleModerationCommand };

