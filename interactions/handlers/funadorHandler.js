// interactions/handlers/funadorHandler.js
// /funador activate|deactivate -> prende/apaga el modo en este servidor.
// /funador start @objetivo     -> arranca el bit, pero SIEMPRE pasando
// primero por core/funadorSession.js, que pide consentimiento explicito
// al acusado (y solo despues invita, sin presionar, a testigos opcionales)
// antes de armar cualquier "veredicto".
import { getFlags, setFlag } from '../../core/behaviorFlags.js';
import { startFunadorSession } from '../../core/funadorSession.js';

export async function handleFunadorCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'activate' || sub === 'deactivate') {
    const value = sub === 'activate';
    await setFlag(guildId, 'funador', value);
    const msg = value
      ? 'listo, modo funador habilitado en este servidor. Para arrancar un "juicio" usen /funador start (siempre le voy a pedir permiso al acusado primero) 🎭'
      : 'ok, modo funador deshabilitado en este servidor.';
    await interaction.reply({ content: msg, ephemeral: false });
    return true;
  }

  if (sub === 'start') {
    const flags = getFlags(guildId);
    if (!flags.funador) {
      await interaction.reply({ content: 'el modo funador esta apagado en este servidor, activalo primero con /funador activate', ephemeral: true });
      return true;
    }
    const targetUser = interaction.options.getUser('objetivo');
    const razon = interaction.options.getString('razon');
    await startFunadorSession(interaction, targetUser, razon);
    return true;
  }

  return false;
}

export default { handleFunadorCommand };
