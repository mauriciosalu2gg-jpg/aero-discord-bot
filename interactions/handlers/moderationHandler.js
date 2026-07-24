import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } from 'discord.js';
import { 
  setModerationActive, 
  getModerationState, 
  setModerationGuardians, 
  addGuardian, 
  hasSeenGuardianTutorial, 
  markGuardianTutorialSeen 
} from '../../core/moderation/index.js';
import { isOwner, isSubCreator, isAdminOrHigher } from '../../core/permissions.js';

export async function sendGuardianTutorialIfNeeded(user, guildId, channel = null) {
  if (hasSeenGuardianTutorial(guildId, user.id)) return;

  try {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ ¡Bienvenido al Equipo de Guardianes!')
      .setColor(0x3498DB)
      .setDescription(`Hola **${user.username}**, has sido asignado como **Guardián de Auto-Moderación** de Novarito.\n\nAquí tienes un tutorial rápido de una sola vez sobre cómo funciona el sistema de sanciones y puntos:`)
      .addFields(
        { name: '📊 Sistema de Puntos e Infracciones', value: 'Cada falta detectada suma puntos al usuario según la gravedad:\n• **20 pts**: Advertencia (Aviso de falta menor)\n• **40 pts**: Silencio Temporal / Mute (10 min)\n• **70 pts**: Expulsión del servidor (Kick)\n• **100 pts**: Baneo Permanente (Ban)', inline: false },
        { name: '📉 Expiración de Puntos', value: 'Los puntos de los usuarios disminuyen automáticamente **20 pts cada 30 días** si mantienen buena conducta.', inline: false },
        { name: '🔔 Notificaciones de Infracción', value: 'Recibirás menciones y alertas directas cuando se sancione a un usuario para que puedas supervisar la situación en tiempo real.', inline: false }
      )
      .setFooter({ text: 'Novarito Moderación • Este tutorial solo se muestra 1 sola vez por guardián' })
      .setTimestamp();

    let sent = false;
    try {
      await user.send({ embeds: [embed] });
      sent = true;
    } catch {
      if (channel) {
        await channel.send({ content: `<@${user.id}> *(Tienes los DMs cerrados, te dejo la guía de Guardián aquí)*:`, embeds: [embed] }).catch(() => {});
        sent = true;
      }
    }

    if (sent) {
      await markGuardianTutorialSeen(guildId, user.id);
    }
  } catch (err) {
    console.warn('[guardian-tutorial] Error enviando tutorial:', err.message);
  }
}

export async function handleModerationCommand(interaction) {
  const guildId = interaction.guildId;

  if (!guildId) {
    return interaction.reply({ content: 'Este comando solo se puede usar en un servidor.', ephemeral: true });
  }

  const subcommand = interaction.options.getSubcommand(false);

  try {
    // ── SUBCOMANDO: GUARDIANES ──────────────────────────────
    if (subcommand === 'guardianes') {
      const gUsers = [
        interaction.options.getUser('usuario1'),
        interaction.options.getUser('usuario2'),
        interaction.options.getUser('usuario3'),
        interaction.options.getUser('usuario4'),
        interaction.options.getUser('usuario5'),
        interaction.options.getUser('usuario6'),
      ].filter(Boolean);

      if (gUsers.length === 0) {
        return interaction.reply({ content: '❌ Debes etiquetar al menos un usuario para asignar como guardián.', ephemeral: true });
      }

      const guardianIds = gUsers.map(u => u.id);
      await setModerationGuardians(guildId, guardianIds);

      // Enviar tutorial a cada uno si no lo han visto
      for (const u of gUsers) {
        await sendGuardianTutorialIfNeeded(u, guildId, interaction.channel);
      }

      const tags = gUsers.map(u => `<@${u.id}>`).join(', ');
      return interaction.reply({
        content: `🛡️ **Guardianes Asignados**: ${tags}\nEllos recibirán las notificaciones e infracciones de auto-moderación.`,
        ephemeral: false
      });
    }

    // ── SUBCOMANDO: ESTADO ──────────────────────────────────
    if (subcommand === 'estado') {
      const state = getModerationState(guildId);
      const isAct = state.active && state.status === 'active';
      const guardians = state.guardians || [];
      const guardianTags = guardians.length > 0 ? guardians.map(id => `<@${id}>`).join(', ') : '*Ninguno asignado (usar `/moderacion guardianes`)*';

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Estado de Auto-Moderación')
        .setColor(isAct ? 0x2ECC71 : 0xE74C3C)
        .addFields(
          { name: 'Estado', value: isAct ? '🟢 Activa' : '🔴 Desactivada', inline: true },
          { name: 'Modo Ciclo', value: state.status || 'disabled', inline: true },
          { name: 'Guardianes Configurados', value: guardianTags, inline: false }
        )
        .setFooter({ text: 'Novarito Moderación' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── SUBCOMANDO: ACTIVAR (o comportamiento por defecto) ─
    const activar = interaction.options.getBoolean('activar') ?? true;
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

    // Responder el resultado del comando activar
    await interaction.reply({ content: replyMsg, ephemeral: false });

    // Si se activó y NO hay guardianes configurados aún, iniciar invitación automática
    if (activar) {
      const state = getModerationState(guildId);
      if (!state.guardians || state.guardians.length === 0) {
        // Buscar candidatos automáticamente (Admins, Co-owners, etc)
        let candidates = [];
        try {
          const members = await interaction.guild.members.fetch();
          candidates = members.filter(m => !m.user.bot && (
            m.permissions.has('Administrator') ||
            m.permissions.has('ManageGuild') ||
            isOwner(m.user) ||
            isSubCreator(m.user) ||
            isAdminOrHigher(m.user)
          )).first(6);
        } catch {
          candidates = [];
        }

        if (candidates.length > 0) {
          const candidateTags = candidates.map(m => `<@${m.id}>`).join(' ');
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('guardian_accept')
              .setLabel('✅ Aceptar ser Guardián')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('guardian_decline')
              .setLabel('❌ Rechazar')
              .setStyle(ButtonStyle.Danger)
          );

          const inviteMsg = await interaction.channel.send({
            content: `🛡️ **Invitación a Guardianes de Auto-Moderación**\n${candidateTags}\nHan sido seleccionados como candidatos a **Guardianes** de este servidor. ¿Aceptan el rol para recibir notificaciones e infracciones?`,
            components: [row]
          }).catch(() => null);

          if (inviteMsg) {
            // Collector por 1 hora (3,600,000 ms)
            const collector = inviteMsg.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 3600000
            });

            collector.on('collect', async i => {
              if (i.customId === 'guardian_accept') {
                await addGuardian(guildId, i.user.id);
                await sendGuardianTutorialIfNeeded(i.user, guildId, interaction.channel);
                await i.reply({ content: `✅ **${i.user.username}**, te has unido como Guardián de moderación.`, ephemeral: true }).catch(() => {});
              } else if (i.customId === 'guardian_decline') {
                await i.reply({ content: `👌 Entendido **${i.user.username}**, no te guardaré como guardián.`, ephemeral: true }).catch(() => {});
              }
            });

            collector.on('end', async () => {
              // Desactivar botones después de 1 hora
              const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('guardian_accept').setLabel('✅ Aceptar ser Guardián').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('guardian_decline').setLabel('❌ Rechazar').setStyle(ButtonStyle.Danger).setDisabled(true)
              );
              await inviteMsg.edit({
                content: `⏳ *La invitación de 1 hora para guardianes ha finalizado. Puedes asignar guardianes manualmente usando \`/moderacion guardianes\`.*`,
                components: [disabledRow]
              }).catch(() => {});
            });
          }
        }
      }
    }

  } catch (err) {
    console.error('[moderationHandler] Error:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Error al actualizar la configuración de moderación.', ephemeral: true });
    }
  }
}

export default { handleModerationCommand };
