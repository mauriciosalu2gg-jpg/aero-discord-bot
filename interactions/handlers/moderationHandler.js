// interactions/handlers/moderationHandler.js
import { clearStrikes, getStrikeInfo, isModerationActive, setModerationActive } from '../../core/moderationEngine.js';

export async function handleModerationCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'status') {
    const active = isModerationActive(guildId);
    await interaction.reply({
      content: active
        ? '🛡️ moderacion automatica activa. Estoy vigilando insultos, hostigamiento y reincidencias.'
        : '🛡️ moderacion automatica apagada.',
      ephemeral: false,
    });
    return true;
  }

  if (sub === 'reset') {
    const user = interaction.options.getUser('usuario', true);
    const strikeInfo = getStrikeInfo(guildId, user.id);
    await clearStrikes(guildId, user.id);
    await interaction.reply({
      content: `🧹 strikes reiniciados para <@${user.id}> (tenia ${strikeInfo.strikes || 0}).`,
      allowedMentions: { users: [user.id] },
      ephemeral: false,
    });
    return true;
  }

  const value = sub === 'activate';
  await setModerationActive(guildId, value);

  const msg = value
    ? '🛡️ modo moderacion activado. Ahora vigilo el chat: aviso, timeout corto, timeout largo, kick y ban si alguien sigue faltando el respeto.'
    : '🛡️ modo moderacion desactivado, dejo de sancionar automatico.';

  await interaction.reply({ content: msg, ephemeral: false });
  return true;
}

export default { handleModerationCommand };
