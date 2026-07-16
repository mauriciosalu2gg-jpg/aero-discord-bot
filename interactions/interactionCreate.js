import { isAdminOrHigher, isCreatorOrSubCreator } from '../core/permissions.js';
import { handleConfigCommand } from './handlers/configHandler.js';
import { handleResetMemoryCommand } from './handlers/resetMemoryHandler.js';
import { handleAiCommand } from './handlers/aiHandler.js';
import { handleImaginarCommand } from './handlers/imaginarHandler.js';
import { handlePersonalidadCommand } from './handlers/personalidadHandler.js';

export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  // Comandos de uso publico
  const publicCommands = ['imaginar'];
  
  if (!publicCommands.includes(cmd)) {
    // Los demas comandos solo los puede usar Lara o Alero
    if (!isCreatorOrSubCreator(interaction.user)) {
      await interaction.reply({
        content: 'Este comando solo lo pueden usar Lara o Alero.',
        ephemeral: true,
      });
      return;
    }
  }

  try {
    if (cmd === 'config') {
      await handleConfigCommand(interaction);
    } else if (cmd === 'ai') {
      await handleAiCommand(interaction);
    } else if (cmd === 'memoria') {
      await handleResetMemoryCommand(interaction);
    } else if (cmd === 'imaginar') {
      await handleImaginarCommand(interaction);
    } else if (cmd === 'personalidad') {
      await handlePersonalidadCommand(interaction);
    }
  } catch (err) {
    console.error(`[interaction:${cmd}]`, err);
    const payload = { content: 'Hubo un error al ejecutar ese comando.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

export default { handleInteraction };
