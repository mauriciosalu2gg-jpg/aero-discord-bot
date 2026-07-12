import { handleModelStatusCommand } from './modelStatusHandler.js';
import { handleProviderStatusCommand } from './providerStatusHandler.js';
import { handleForceProviderCommand } from './forceProviderHandler.js';

export async function handleAiCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'status') {
    return handleModelStatusCommand(interaction);
  }

  if (sub === 'providers') {
    return handleProviderStatusCommand(interaction);
  }

  if (sub === 'force') {
    return handleForceProviderCommand(interaction);
  }

  return false;
}

export default { handleAiCommand };
