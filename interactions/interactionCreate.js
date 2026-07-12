// interactions/interactionCreate.js
// Punto de entrada unico para /bot. Algunas ramas son abiertas
// (ai y funador objecion); el resto queda restringido a Lara/Gio.
import { isCreatorOrSubCreator } from '../core/permissions.js';
import { handleConfigCommand } from './handlers/configHandler.js';
import { handleModerationCommand } from './handlers/moderationHandler.js';
import { handleResetMemoryCommand } from './handlers/resetMemoryHandler.js';
import { handleFunadorCommand } from './handlers/funadorHandler.js';
import { handleAiCommand } from './handlers/aiHandler.js';

function isOpenRoute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);
  return group === 'ai' || (group === 'funador' && sub === 'objecion');
}

export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== 'bot') return;

  const group = interaction.options.getSubcommandGroup(false);

  if (!isOpenRoute(interaction) && !isCreatorOrSubCreator(interaction.user)) {
    await interaction.reply({ content: 'ese comando solo lo pueden usar Lara o Gio', ephemeral: true });
    return;
  }

  try {
    if (group === 'config') {
      await handleConfigCommand(interaction);
      return;
    }
    if (group === 'moderation') {
      await handleModerationCommand(interaction);
      return;
    }
    if (group === 'ai') {
      await handleAiCommand(interaction);
      return;
    }
    if (group === 'memory') {
      await handleResetMemoryCommand(interaction);
      return;
    }
    if (group === 'funador') {
      await handleFunadorCommand(interaction);
      return;
    }
  } catch (err) {
    console.error(`[interaction:bot/${group}]`, err);
    const payload = { content: 'algo se rompio ejecutando eso, intenta de nuevo', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

export default { handleInteraction };
