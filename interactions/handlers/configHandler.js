import { setFlag } from '../../core/behaviorFlags.js';

export async function handleConfigCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'global';

  if (sub === 'forcetalk') {
    const on = interaction.options.getBoolean('activar');
    await setFlag(guildId, 'forceTalk', on);
    await interaction.reply({ content: on ? 'ok, ahora respondo sin que me mencionen' : 'listo, vuelvo a responder solo cuando me hablen directo', ephemeral: false });
    return true;
  }

  if (sub === 'seguridad') {
    const on = interaction.options.getBoolean('activar');
    await setFlag(guildId, 'securityMode', on);
    await interaction.reply({ content: on ? 'modo seguridad activado: me pongo mas cuidadoso y serio' : 'modo seguridad desactivado', ephemeral: false });
    return true;
  }

  return false;
}

export default { handleConfigCommand };
