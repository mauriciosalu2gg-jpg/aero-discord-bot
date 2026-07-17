import { handleEstado } from './ai/estado.js';
import { handleProveedor } from './ai/proveedor.js';
import { handleImaginar } from './ai/imaginar.js';
import { handleMemoria } from './ai/memoria.js';
import { handlePersonalidad } from './ai/personalidad.js';
import { clearPoints, getUserPoints } from '../../core/moderation/index.js';
import { askAI } from '../../services/aiManager.js';

export function isAltoMando(interaction) {
  const member = interaction.member;
  if (!member) return false;
  
  if (member.id === member.guild.ownerId || member.permissions.has('Administrator')) return true;
  if (member.permissions.has('ManageGuild') || member.permissions.has('ModerateMembers')) return true;
  
  const altoMandoNames = ['owner', 'co-owner', 'admin', 'administrador', 'moderador', 'mod', 'staff', 'alto mando', 'creador', 'soporte', 'director', 'vice-presidente', 'co-creador'];
  return member.roles.cache.some(role => 
    altoMandoNames.some(name => role.name.toLowerCase().includes(name))
  );
}

export async function handleAiCommand(interaction) {
  try {
    const subcommand = interaction.options.getSubcommand(false);

    if (!subcommand) {
      if (!isAltoMando(interaction)) {
        return interaction.reply({ content: '💡 Escribe `/ai` y selecciona una opción válida.', ephemeral: true });
      } else {
        await interaction.deferReply();
        return await handleEstado(interaction);
      }
    }

    const restrictedSubcommands = ['proveedor', 'estado', 'limpiar_memoria', 'modo_memoria', 'editar_personalidad', 'pts_reset'];
    
    if (restrictedSubcommands.includes(subcommand) && !isAltoMando(interaction)) {
      return interaction.reply({
        content: '❌ No tienes permisos de **Alto Mando** en este servidor para usar estas configuraciones.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: false }).catch(() => {});

    if (subcommand === 'chat') {
      const mensaje = interaction.options.getString('mensaje');
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
        await interaction.followUp(`✨ Puntos de **${ptsResetUser.username}** reiniciados con éxito por buena conducta. (Tenía ${oldPoints} pts).`);
      } else {
        await interaction.followUp('❌ Este comando solo funciona en servidores.');
      }
      return;
    }

    if (subcommand === 'proveedor') {
      const proveedor = interaction.options.getString('nombre');
      await handleProveedor(interaction, proveedor);
      await interaction.followUp('✅ Proveedor actualizado.');
      return;
    }
    if (subcommand === 'estado') {
      await handleEstado(interaction);
      return;
    }
    if (subcommand === 'imaginar') {
      const prompt = interaction.options.getString('prompt');
      await handleImaginar(interaction, prompt);
      return;
    }
    if (subcommand === 'limpiar_memoria') {
      await handleMemoria(interaction, 'limpiar');
      await interaction.followUp('✅ Memoria limpiada.');
      return;
    }
    if (subcommand === 'modo_memoria') {
      const nivel = interaction.options.getString('nivel');
      await handleMemoria(interaction, 'modo', nivel);
      await interaction.followUp(`✅ Modo de memoria cambiado a **${nivel}**.`);
      return;
    }
    if (subcommand === 'nombre_y_pronombre') {
      const nombre = interaction.options.getString('nombre');
      const pronombre = interaction.options.getString('pronombre');
      await handlePersonalidad(interaction, 'nombre_y_pronombre', nombre, pronombre);
      return;
    }
    if (subcommand === 'editar_personalidad') {
      const rasgo = interaction.options.getString('rasgo');
      await handlePersonalidad(interaction, 'editar_bot_personality', rasgo);
      return;
    }
    if (subcommand === 'ver_personalidad') {
      await handlePersonalidad(interaction, 'ver');
      return;
    }

  } catch (err) {
    console.error(`[aiHandler] Error:`, err);
    await interaction.followUp({ content: 'Hubo un error al procesar la opción.' }).catch(() => {});
  }
}

export default { handleAiCommand };
