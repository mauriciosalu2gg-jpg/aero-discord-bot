// interactions/handlers/configHandler.js
// /bot config -> reemplaza y reescribe los viejos comandos de texto huerfanos
// (!calladito, !ya puedes hablar, !groserias on/off, !datos on/off) que
// NUNCA estuvieron cableados a index.js y por lo tanto jamas funcionaron.
// Ahora es UN solo slash command comprimido con subcomandos, en vez de
// varios comandos de texto sueltos:
//
//   /bot config calladito        -> apaga groserias Y datos curiosos autonomos
//   /bot config hablar           -> reactiva ambos
//   /bot config groserias on/off -> control fino de groserias
//   /bot config datos on/off     -> control fino de datos curiosos autonomos
//
// Exclusivo de Lara/Alero (se valida ademas en interactionCreate.js).
import { setFlag } from '../../core/behaviorFlags.js';

export async function handleConfigCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'global';

  if (sub === 'calladito') {
    await setFlag(guildId, 'swearing', false);
    await setFlag(guildId, 'factsAutoplay', false);
    await interaction.reply({ content: 'ok, me porto bien y no hablo solo hasta que me digas 🫡', ephemeral: false });
    return true;
  }

  if (sub === 'hablar') {
    await setFlag(guildId, 'swearing', true);
    await setFlag(guildId, 'factsAutoplay', true);
    await interaction.reply({ content: 'volvi al modo normal', ephemeral: false });
    return true;
  }

  if (sub === 'groserias') {
    const on = interaction.options.getBoolean('activar');
    await setFlag(guildId, 'swearing', on);
    await interaction.reply({ content: on ? 'ok, groserias activadas' : 'listo, sin groserias', ephemeral: false });
    return true;
  }

  if (sub === 'datos') {
    const on = interaction.options.getBoolean('activar');
    await setFlag(guildId, 'factsAutoplay', on);
    await interaction.reply({ content: on ? 'ok, vuelvo a tirar datos curiosos si el chat esta muerto' : 'listo, no interrumpo mas solo', ephemeral: false });
    return true;
  }

  if (sub === 'forcetalk') {
    const on = interaction.options.getBoolean('activar');
    await setFlag(guildId, 'forceTalk', on);
    await interaction.reply({ content: on ? 'ok, ahora respondo sin que me mencionen' : 'listo, vuelvo a responder solo cuando me hablen directo', ephemeral: false });
    return true;
  }

  if (sub === 'seguridad') {
    const on = interaction.options.getBoolean('activar');
    await setFlag(guildId, 'securityMode', on);
    await interaction.reply({ content: on ? 'modo seguridad activado: me pongo mas cuidadoso y cero groserias' : 'modo seguridad desactivado', ephemeral: false });
    return true;
  }

  if (sub === 'ambiente') {
    const on = interaction.options.getBoolean('activar');
    await setFlag(guildId, 'ambientMode', on);
    await interaction.reply({ content: on ? 'ambient mode activado, puedo meter comentario espontaneo cuando pinte' : 'ambient mode desactivado', ephemeral: false });
    return true;
  }

  return false;
}

export default { handleConfigCommand };
