import { EmbedBuilder } from 'discord.js';
import { isAdminOrHigher } from '../../core/permissions.js';
import { isAltoMando } from './aiHandler.js';
import { getFlags, getModerationHelpers, setModerationHelpers, recordDeletedModerationMessage } from '../../core/behaviorFlags.js';

function resolvePriorityMembers(guild) {
  const members = [...guild.members.cache.values()];
  return members.filter(member => {
    const perms = member.permissions;
    return perms?.has?.('Administrator') || perms?.has?.('ManageGuild') || perms?.has?.('ModerateMembers');
  });
}

export async function handleGuardianCommand(interaction) {
  if (!interaction.guildId) {
    return interaction.reply({ content: '❌ Este comando solo funciona dentro de un servidor.', ephemeral: true });
  }

  if (!isAdminOrHigher(interaction.user) && !isAltoMando(interaction)) {
    return interaction.reply({ content: '❌ No tienes permisos de **Alto Mando** para configurar al guardián.', ephemeral: true });
  }

  const modo = interaction.options.getString('modo');
  const limite = interaction.options.getInteger('limite');
  const agregar = interaction.options.getUser('agregar');
  const quitar = interaction.options.getUser('quitar');
  const listar = interaction.options.getBoolean('listar');
  const limpiar = interaction.options.getBoolean('limpiar');
  const regAutorId = interaction.options.getString('registrar_autor_id');
  const regAccion = interaction.options.getString('registrar_accion');
  const regResumen = interaction.options.getString('registrar_resumen');

  const guild = interaction.guild;
  const helpers = getModerationHelpers(interaction.guildId);

  // 1. Configuración de Modo y Límite
  if (modo !== null || limite !== null) {
    const updatedMode = modo || helpers.mode || 'auto';
    const updatedLimit = limite !== null ? Math.max(1, Math.min(10, limite)) : (helpers.limit || 1);

    const updated = await setModerationHelpers(interaction.guildId, {
      mode: updatedMode,
      limit: updatedLimit,
    });

    return interaction.reply({
      content: `✅ Guardián configurado. Modo: **${updated.mode}** | Límite: **${updated.limit}**`,
      ephemeral: true,
    });
  }

  // 2. Agregar usuario
  if (agregar) {
    const userIds = Array.from(new Set([...(helpers.userIds || []), agregar.id]));
    const updated = await setModerationHelpers(interaction.guildId, { userIds });

    return interaction.reply({
      content: `✅ Agregué a **${agregar.username}** a la lista de helpers. Total: **${updated.userIds.length}**.`,
      ephemeral: true,
    });
  }

  // 3. Quitar usuario
  if (quitar) {
    const userIds = (helpers.userIds || []).filter(id => id !== quitar.id);
    const updated = await setModerationHelpers(interaction.guildId, { userIds });

    return interaction.reply({
      content: `✅ Quité a **${quitar.username}** de la lista de helpers. Total: **${updated.userIds.length}**.`,
      ephemeral: true,
    });
  }

  // 4. Limpiar
  if (limpiar) {
    const updated = await setModerationHelpers(interaction.guildId, {
      mode: 'auto',
      limit: 1,
      userIds: [],
    });

    return interaction.reply({
      content: `✅ Configuración de guardián restaurada. Modo: **${updated.mode}**, límite: **${updated.limit}**.`,
      ephemeral: true,
    });
  }

  // 5. Registrar manualmente un borrado
  if (regAutorId) {
    if (!regAccion || !regResumen) {
      return interaction.reply({
        content: '❌ Si vas a registrar manualmente, necesitas rellenar `registrar_accion` y `registrar_resumen`.',
        ephemeral: true
      });
    }

    await recordDeletedModerationMessage(interaction.guildId, {
      authorId: regAutorId,
      action: regAccion,
      excerpt: regResumen,
      channelId: interaction.channelId,
      byCommand: true,
      createdAt: new Date().toISOString(),
    });

    return interaction.reply({
      content: '✅ Registro manual guardado en el historial del guardián.',
      ephemeral: true,
    });
  }

  // 6. Listar (por defecto si no hay opciones, o si se pide listar)
  if (listar || (!modo && !limite && !agregar && !quitar && !limpiar && !regAutorId)) {
    const flags = getFlags(interaction.guildId);
    const modHelpers = flags.moderationHelpers || helpers;
    const eligible = resolvePriorityMembers(guild);
    
    let selected = [];
    if (modHelpers.mode === 'custom') {
      // In custom mode, grab EXACTLY the users selected, regardless of permissions.
      selected = (modHelpers.userIds || [])
        .map(id => guild.members.cache.get(id))
        .filter(Boolean)
        .slice(0, modHelpers.limit || 1);
    } else {
      selected = eligible.slice(0, modHelpers.limit || 1);
    }

    const recent = (flags.recentDeletedMessages || []).slice(0, 5);
    const embed = new EmbedBuilder()
      .setTitle('Helpers del Guardián')
      .setColor(0x5b8cff)
      .addFields(
        { name: 'Modo', value: `\`${modHelpers.mode || 'auto'}\``, inline: true },
        { name: 'Límite', value: `\`${modHelpers.limit || 1}\``, inline: true },
        {
          name: 'Lista custom',
          value: (modHelpers.userIds || []).length
            ? (modHelpers.userIds || []).map(id => `<@${id}>`).join('\n')
            : 'Vacía',
          inline: false,
        },
        {
          name: 'Elegidos ahora',
          value: selected.length ? selected.map(m => `<@${m.id}>`).join('\n') : 'Nadie',
          inline: false,
        },
        {
          name: 'Mensajes borrados recientes',
          value: recent.length
            ? recent.map(entry => `• <#${entry.channelId || '0'}> ${entry.action || 'WARN'} - <@${entry.authorId || '0'}> - ${entry.excerpt || 'sin texto'}`).join('\n')
            : 'Sin registros recientes',
          inline: false,
        }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

export default { handleGuardianCommand };
