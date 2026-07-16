import { handleModelStatusCommand } from './modelStatusHandler.js';
import { handleForceProviderCommand } from './forceProviderHandler.js';

export async function handleAiCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'status') {
    return handleModelStatusCommand(interaction);
  }

  if (sub === 'force') {
    return handleForceProviderCommand(interaction);
  }

  return false;
}

export default { handleAiCommand };
