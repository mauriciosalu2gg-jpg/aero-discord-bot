import { handleAiCommand } from './handlers/aiHandler.js';
import { handleModerationCommand } from './handlers/moderationHandler.js';
import { handleNovaritoCommand } from './handlers/novaritoHandler.js';

export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {
    if (cmd === 'ai') {
      await handleAiCommand(interaction);
    } else if (cmd === 'moderacion') {
      await handleModerationCommand(interaction);
    } else if (cmd === 'novarito') {
      await handleNovaritoCommand(interaction);
    } else {
      const payload = { content: 'Comando no reconocido o desactualizado. Usa /novarito ayuda.', ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
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
