import { setModerationActive, setGoodPoints } from '../../core/moderation/index.js';
import { isAltoMando } from './aiHandler.js';
import { handleGuardianCommand } from './guardianHandler.js';
import { setFlag, getFlags } from '../../core/behaviorFlags.js';

export async function handleModerationCommand(interaction) {
  const guildId = interaction.guildId;

  if (!guildId) {
    return interaction.reply({ content: 'Este comando solo se puede usar en un servidor.', ephemeral: true });
  }

  if (!isAltoMando(interaction)) {
    return interaction.reply({
      content: '❌ No tienes permisos de **Alto Mando** en este servidor para usar moderación.',
      ephemeral: true
    });
  }

  const subCommand = interaction.options.getSubcommand();

  try {
    if (subCommand === 'estado') {
      const activar = interaction.options.getBoolean('activar');
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
          durationMs = 24 * 60 * 60 * 1000;
          replyMsg = `La automoderación ha sido **activada** por defecto durante **24 horas** en todos los canales. 🛡️\n*(Descansará 10 horas si no hay infracciones al finalizar el ciclo)*`;
        }
      } else {
        replyMsg = 'La automoderación ha sido **desactivada** en este servidor.';
      }

      await setModerationActive(guildId, activar, durationMs, interaction.channelId, interaction.user.id);
      return interaction.reply({ content: replyMsg, ephemeral: false });
    }
    
    if (subCommand === 'guardian') {
      return await handleGuardianCommand(interaction);
    }
    
    if (subCommand === 'karma') {
      const user = interaction.options.getUser('usuario');
      const puntos = interaction.options.getInteger('puntos');
      await setGoodPoints(guildId, user.id, puntos);
      return interaction.reply({ content: `✅ Karma de **${user.username}** actualizado a **${puntos}** puntos a favor.`, ephemeral: true });
    }

    if (subCommand === 'permisos_link') {
      const user = interaction.options.getUser('usuario');
      const permitir = interaction.options.getBoolean('permitir');
      const flags = getFlags(guildId);
      const whitelist = new Set(flags.spamLinkWhitelist || []);
      
      if (permitir) {
        whitelist.add(user.id);
      } else {
        whitelist.delete(user.id);
      }
      
      await setFlag(guildId, 'spamLinkWhitelist', Array.from(whitelist));
      return interaction.reply({ content: `✅ Permiso de links en canales spam para **${user.username}** ha sido **${permitir ? 'OTORGADO' : 'REVOCADO'}**.`, ephemeral: true });
    }
  } catch (err) {
    console.error('[moderationHandler] Error:', err);
    return interaction.reply({ content: 'Error al ejecutar el comando de moderación.', ephemeral: true });
  }
}

export default { handleModerationCommand };
