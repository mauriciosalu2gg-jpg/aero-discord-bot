// interactions/handlers/moderationHandler.js
import { setModerationActive } from '../../core/moderationEngine.js';

export async function handleModerationCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const value = sub === 'activate';

  await setModerationActive(guildId, value);

  const msg = value
    ? '🛡️ modo moderacion activado. Ahora vigilo el chat: aviso, timeout corto, timeout largo, kick y ban si alguien sigue faltando el respeto.'
    : '🛡️ modo moderacion desactivado, dejo de sancionar automatico.';

  await interaction.reply({ content: msg, ephemeral: false });
  return true;
}

export default { handleModerationCommand };
