import { handleModelStatusCommand } from './modelStatusHandler.js';
import { handleProviderStatusCommand } from './providerStatusHandler.js';

export async function handleAiCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'status') {
    return handleModelStatusCommand(interaction);
  }

  if (sub === 'providers') {
    return handleProviderStatusCommand(interaction);
  }

  return false;
}

export default { handleAiCommand };
