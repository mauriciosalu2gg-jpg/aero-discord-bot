// interactions/handlers/moderationHandler.js
import { isModerationActive, setModerationActive, getUserPoints, clearPoints } from '../../core/moderation/index.js';

export async function handleModerationCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'status') {
    const active = isModerationActive(guildId);
    await interaction.reply({
      content: active
        ? '🛡️ moderacion automatica inteligente activa. Estoy usando IA para vigilar infracciones severas.'
        : '🛡️ moderacion automatica apagada.',
      ephemeral: false,
    });
    return true;
  }

  if (sub === 'reset') {
    const user = interaction.options.getUser('usuario', true);
    const points = await getUserPoints(guildId, user.id);
    await clearPoints(guildId, user.id);
    await interaction.reply({
      content: `🧹 puntos reiniciados para <@${user.id}> (tenia ${points || 0} puntos).`,
      allowedMentions: { users: [user.id] },
      ephemeral: false,
    });
    return true;
  }

  const value = sub === 'activate';
  await setModerationActive(guildId, value);

  const msg = value
    ? '🛡️ modo moderacion activado. El sistema Hibrido + IA (puntuacion) esta activo.'
    : '🛡️ modo moderacion desactivado, dejo de sancionar automatico.';

  await interaction.reply({ content: msg, ephemeral: false });
  return true;
}

export default { handleModerationCommand };
