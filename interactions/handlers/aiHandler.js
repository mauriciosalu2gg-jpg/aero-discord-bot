import { handleEstado } from './ai/estado.js';
import { handleProveedor } from './ai/proveedor.js';
import { handleImaginar } from './ai/imaginar.js';
import { handlePersonalidad } from './ai/personalidad.js';
import { clearPoints, getUserPoints } from '../../core/moderation/index.js';
import { isAdminOrHigher } from '../../core/permissions.js';
import { askAI } from '../../services/aiManager.js';
import { getUserMemoryConfig, setUserMemoryConfig } from '../../core/memory/config.js';
import { resetUserMemory, purgeUserMemory } from '../../core/memory/index.js';

function isAltoMando(interaction) {
  return interaction.member?.permissions?.has('Administrator')
    || isAdminOrHigher(interaction.user);
}

export async function handleAiCommand(interaction) {
  try {
    const rawSub = interaction.options.getSubcommand(false);
    const optionSelected = interaction.options.getString('opcion');
    const subcommand = optionSelected || rawSub || 'estado';

    const restrictedSubcommands = ['proveedor', 'estado', 'limpiar_memoria', 'modo_memoria', 'editar_personalidad', 'pts_reset'];
    
    if (restrictedSubcommands.includes(subcommand) && !isAltoMando(interaction)) {
      return interaction.reply({
        content: '❌ No tienes permisos de **Alto Mando** en este servidor para usar esta configuración.',
        ephemeral: true
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false }).catch(() => {});
    }

    if (subcommand === 'chat') {
      const mensaje = interaction.options.getString('mensaje') || 'Hola Novarito';
      try {
        const respuesta = await askAI([{ role: 'user', content: mensaje }]);
        await interaction.editReply(`**Tú:** ${mensaje}\n\n**Novarito:** ${respuesta.text}`);
      } catch (e) {
        await interaction.editReply(`Hubo un error: ${e.message}`);
      }
      return;
    }

    if (subcommand === 'pts_reset') {
      const ptsResetUser = interaction.options.getUser('usuario');
      const guildId = interaction.guild?.id;
      if (guildId && ptsResetUser) {
        const oldPoints = await getUserPoints(guildId, ptsResetUser.id);
        await clearPoints(guildId, ptsResetUser.id);
        await interaction.editReply(`✨ Puntos de **${ptsResetUser.username}** reiniciados con éxito por buena conducta. (Tenía ${oldPoints} pts).`);
      } else {
        await interaction.editReply('❌ Debes seleccionar un usuario válido.');
      }
      return;
    }

    if (subcommand === 'proveedor') {
      const proveedor = interaction.options.getString('nombre_proveedor') || interaction.options.getString('nombre') || 'auto';
      await handleProveedor(interaction, proveedor);
      await interaction.editReply(`✅ Proveedor de IA actualizado a: **${proveedor}**.`);
      return;
    }

    if (subcommand === 'estado') {
      await handleEstado(interaction);
      return;
    }

    if (subcommand === 'imaginar') {
      const prompt = interaction.options.getString('mensaje') || interaction.options.getString('prompt') || 'Un paisaje futurista';
      await handleImaginar(interaction, prompt);
      return;
    }

    if (subcommand === 'limpiar_memoria') {
      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const targetServer = interaction.options.getString('servidor');
      try {
        const config = await getUserMemoryConfig(userId);
        await purgeUserMemory(userId, guildId, config.mode, interaction.channelId, targetServer);
        
        let label = 'de este servidor';
        if (targetServer) {
          const s = targetServer.toLowerCase();
          if (s === 'todos') label = 'de TODOS los servidores e historial global';
          else if (s === 'global') label = 'de la memoria global';
          else label = `del servidor **${targetServer}**`;
        }

        await interaction.editReply({ 
          content: `🧹 **Memoria limpiada exitosamente** ${label}.\nNovarito ha borrado permanentemente todos los datos, hechos e historial registrados en esa ubicación.`, 
          ephemeral: false 
        });
      } catch (e) {
        await interaction.editReply({ content: `❌ Error al limpiar memoria: ${e.message}` });
      }
      return;
    }

    if (subcommand === 'modo_memoria') {
      const nivel = interaction.options.getString('nivel') || 'local';
      const userId = interaction.user.id;
      try {
        const config = await getUserMemoryConfig(userId);
        config.mode = nivel;
        await setUserMemoryConfig(userId, config);
        const modeLabel = nivel === 'global' ? '🌐 Global (compartida entre servidores)' : '🏠 Local (solo este servidor)';
        await interaction.editReply(`✅ Modo de memoria cambiado a **${modeLabel}**.\nTus próximas conversaciones usarán este modo.`);
      } catch (e) {
        await interaction.editReply(`❌ Error al cambiar modo: ${e.message}`);
      }
      return;
    }

    if (subcommand === 'nombre_y_pronombre') {
      const nombre = interaction.options.getString('nombre') || interaction.options.getString('mensaje') || interaction.user.username;
      const pronombre = interaction.options.getString('pronombre') || '';
      await handlePersonalidad(interaction, 'nombre_y_pronombre', nombre, pronombre);
      return;
    }

    if (subcommand === 'editar_personalidad') {
      const rasgo = interaction.options.getString('mensaje') || interaction.options.getString('rasgo') || 'gracioso';
      await handlePersonalidad(interaction, 'editar_bot_personality', rasgo);
      return;
    }

    if (subcommand === 'ver_personalidad') {
      await handlePersonalidad(interaction, 'ver');
      return;
    }

  } catch (err) {
    console.error(`[aiHandler] Error:`, err);
    const errMsg = { content: 'Hubo un error al procesar la opción.' };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errMsg).catch(() => {});
    } else {
      await interaction.reply({ ...errMsg, ephemeral: true }).catch(() => {});
    }
  }
}

export default { handleAiCommand };
