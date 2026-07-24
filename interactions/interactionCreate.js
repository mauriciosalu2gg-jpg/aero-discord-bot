import { isAdminOrHigher, isCreatorOrSubCreator } from '../core/permissions.js';
import { handleAiCommand } from './handlers/aiHandler.js';
import { handleModerationCommand } from './handlers/moderationHandler.js';

export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  const isAllowed = isCreatorOrSubCreator(interaction.user) || isAdminOrHigher(interaction.user) || interaction.member?.permissions?.has?.('Administrator');
  if (!isAllowed) {
    await interaction.reply({
      content: '❌ Este comando solo lo pueden usar administradores del servidor o del bot.',
      ephemeral: true,
    });
    return;
  }

  try {
    if (cmd === 'ai') {
      await handleAiCommand(interaction);
    } else if (cmd === 'moderacion') {
      await handleModerationCommand(interaction);
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
