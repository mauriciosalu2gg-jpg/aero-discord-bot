import { handleEstado } from './ai/estado.js';
import { handleProveedor } from './ai/proveedor.js';
import { handleImaginar } from './ai/imaginar.js';
import { handleMemoria } from './ai/memoria.js';
import { handlePersonalidad } from './ai/personalidad.js';

export async function handleAiCommand(interaction) {
  try {
    const proveedor = interaction.options.getString('proveedor');
    const estado = interaction.options.getBoolean('estado');
    const imaginar = interaction.options.getString('imaginar');
    const limpiarMemoria = interaction.options.getBoolean('limpiar_memoria');
    const modoMemoria = interaction.options.getString('modo_memoria');
    const editarPersonalidad = interaction.options.getString('editar_personalidad');
    const verPersonalidad = interaction.options.getBoolean('ver_personalidad');

    // Mapeamos los valores falsos a properties internas para reutilizar los handlers modulares
    if (proveedor) {
      // Mockeamos la firma esperada en el handler actual si es posible,
      // pero como reescribiremos los handlers para que reciban params, podemos llamarlos directo.
    }

    let results = [];
    await interaction.deferReply({ ephemeral: false }).catch(() => {});

    if (proveedor) {
      await handleProveedor(interaction, proveedor);
      results.push('✅ Proveedor actualizado.');
    }
    if (estado) {
      await handleEstado(interaction);
      // El embed de estado se añadirá a la respuesta
    }
    if (imaginar) {
      await handleImaginar(interaction, imaginar);
      // handleImaginar envia la imagen
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
      // handlePersonalidad añade texto de la personalidad
    }

    if (results.length > 0) {
      await interaction.followUp({ content: results.join('\n') });
    }
    
    // Si no enviaron opciones, mostramos el estado por defecto
    if (!proveedor && !estado && !imaginar && !limpiarMemoria && !modoMemoria && !editarPersonalidad && !verPersonalidad) {
      await handleEstado(interaction);
    }
  } catch (err) {
    console.error(`[aiHandler] Error:`, err);
    await interaction.followUp({ content: 'Hubo un error al procesar las opciones.' }).catch(() => {});
  }
}

export default { handleAiCommand };

