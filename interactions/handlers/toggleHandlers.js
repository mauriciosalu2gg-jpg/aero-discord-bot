// interactions/handlers/toggleHandlers.js
// Handlers genericos para los slash commands de tipo "activate/deactivate"
// que solo prenden/apagan un flag: /ambient-mode, /forcetalk, /security.
import { setFlag } from '../../core/behaviorFlags.js';

const TOGGLE_CONFIG = {
  'ambient-mode': {
    flag: 'ambientMode',
    onMsg: 'listo, ahora comento mas seguido por mi cuenta en este canal 👍',
    offMsg: 'ok, vuelvo a comentar solo cuando tenga sentido',
  },
  forcetalk: {
    flag: 'forceTalk',
    onMsg: 'dale, ahora respondo a cualquier mensaje sin que me tengan que mencionar',
    offMsg: 'ok, vuelvo a responder solo cuando me hablan directo',
  },
  security: {
    flag: 'securityMode',
    onMsg: 'ok, modo seguridad activado: nada de groserias ni ragebait de mi parte por ahora',
    offMsg: 'listo, salgo del modo seguridad',
  },
};

export async function handleToggleCommand(interaction, commandName) {
  const config = TOGGLE_CONFIG[commandName];
  if (!config) return false;

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const value = sub === 'activate';

  await setFlag(guildId, config.flag, value);
  await interaction.reply({ content: value ? config.onMsg : config.offMsg, ephemeral: false });
  return true;
}

export default { handleToggleCommand };
