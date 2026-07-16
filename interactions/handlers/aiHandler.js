import { handleEstado } from './ai/estado.js';
import { handleProveedor } from './ai/proveedor.js';
import { handleImaginar } from './ai/imaginar.js';
import { handleMemoria } from './ai/memoria.js';
import { handlePersonalidad } from './ai/personalidad.js';
import { handleConversacion } from './ai/conversacion.js';

export async function handleAiCommand(interaction) {
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  try {
    if (group === 'memoria') return await handleMemoria(interaction);
    if (group === 'personalidad') return await handlePersonalidad(interaction);
    if (group === 'conversacion') return await handleConversacion(interaction);

    switch (sub) {
      case 'estado': return await handleEstado(interaction);
      case 'proveedor': return await handleProveedor(interaction);
      case 'imaginar': return await handleImaginar(interaction);
      case 'chat':
      case 'herramientas':
      case 'estadisticas':
        await interaction.reply({ content: `El subcomando '${sub}' estará disponible próximamente.`, ephemeral: true });
        break;
      default:
        await interaction.reply({ content: `Subcomando '${sub}' no implementado.`, ephemeral: true });
    }
  } catch (err) {
    console.error(`[aiHandler] Error en /ai ${group ? group + ' ' : ''}${sub}:`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Hubo un error al procesar la solicitud.', ephemeral: true }).catch(() => {});
    } else {
      await interaction.followUp({ content: 'Hubo un error al procesar la solicitud.', ephemeral: true }).catch(() => {});
    }
  }
}

export default { handleAiCommand };

