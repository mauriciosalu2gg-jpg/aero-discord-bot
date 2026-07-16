import { handleEstado } from './ai/estado.js';
import { handleProveedor } from './ai/proveedor.js';
import { handleImaginar } from './ai/imaginar.js';
import { handleMemoria } from './ai/memoria.js';
import { handlePersonalidad } from './ai/personalidad.js';
import { clearPoints, getUserPoints } from '../../core/moderation/index.js';

export async function handleAiCommand(interaction) {
  try {
    const proveedor = interaction.options.getString('proveedor');
    const estado = interaction.options.getBoolean('estado');
    const imaginar = interaction.options.getString('imaginar');
    const limpiarMemoria = interaction.options.getBoolean('limpiar_memoria');
    const modoMemoria = interaction.options.getString('modo_memoria');
    const editarPersonalidad = interaction.options.getString('editar_personalidad');
    const verPersonalidad = interaction.options.getBoolean('ver_personalidad');
    const ptsResetUser = interaction.options.getUser('pts_reset');

    let results = [];
    await interaction.deferReply({ ephemeral: false }).catch(() => {});

    if (ptsResetUser) {
      const allowedIds = ['971639277626720268', '1005707582389899305'];
      if (!allowedIds.includes(interaction.user.id)) {
        results.push('❌ No tienes permiso para reiniciar puntos de moderación. Solo Lara y Gio pueden hacerlo.');
      } else {
        const guildId = interaction.guild?.id;
        if (guildId) {
          const oldPoints = await getUserPoints(guildId, ptsResetUser.id);
          await clearPoints(guildId, ptsResetUser.id);
          results.push(`✨ Puntos de **${ptsResetUser.username}** reiniciados con éxito por buena conducta. (Tenía ${oldPoints} pts).`);
        } else {
          results.push('❌ Este comando solo funciona en servidores.');
        }
      }
    }

    if (proveedor) {
      await handleProveedor(interaction, proveedor);
      results.push('✅ Proveedor actualizado.');
    }
    if (estado) {
      await handleEstado(interaction);
    }
    if (imaginar) {
      await handleImaginar(interaction, imaginar);
    }
    if (limpiarMemoria) {
      await handleMemoria(interaction, 'limpiar');
      results.push('✅ Memoria limpiada.');
    }
    if (modoMemoria) {
      await handleMemoria(interaction, 'modo', modoMemoria);
      results.push(`✅ Modo de memoria cambiado a **${modoMemoria}**.`);
    }
    if (editarPersonalidad) {
      await handlePersonalidad(interaction, 'editar', editarPersonalidad);
      results.push(`✅ Personalidad editada: te llamaré **${editarPersonalidad}**.`);
    }
    if (verPersonalidad) {
      await handlePersonalidad(interaction, 'ver');
    }

    if (results.length > 0) {
      await interaction.followUp({ content: results.join('\n') });
    }
    
    // Si no enviaron opciones, mostramos el estado por defecto
    if (!proveedor && !estado && !imaginar && !limpiarMemoria && !modoMemoria && !editarPersonalidad && !verPersonalidad && !ptsResetUser) {
      await handleEstado(interaction);
    }
  } catch (err) {
    console.error(`[aiHandler] Error:`, err);
    await interaction.followUp({ content: 'Hubo un error al procesar las opciones.' }).catch(() => {});
  }
}

export default { handleAiCommand };

