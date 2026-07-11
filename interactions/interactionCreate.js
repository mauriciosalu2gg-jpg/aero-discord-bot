// interactions/interactionCreate.js
// Punto de entrada unico para TODOS los slash commands. Valida que quien
// ejecute sea Lara o Gio (isCreatorOrSubCreator) antes de despachar a
// cualquier handler -- estos comandos son admin-only por diseno, sin
// excepcion, sin importar permisos de Discord del server.
import { isCreatorOrSubCreator } from '../core/permissions.js';
import { handleToggleCommand } from './handlers/toggleHandlers.js';
import { handleModerationCommand } from './handlers/moderationHandler.js';
import { handleModelStatusCommand } from './handlers/modelStatusHandler.js';
import { handleResetMemoryCommand } from './handlers/resetMemoryHandler.js';
import { handleFunadorCommand } from './handlers/funadorHandler.js';
import { handleObjecionCommand } from './handlers/objecionHandler.js';
import { handleProviderStatusCommand } from './handlers/providerStatusHandler.js';

const TOGGLE_COMMANDS = new Set(['ambient-mode', 'forcetalk', 'security']);

// /modelstatus es de lectura, abierto a cualquiera (igual que el viejo
// /fluxerstatus / !provider). /objecion tambien es abierto: lo valida
// registerObjection() en funadorSession.js contra los abogados reales de
// la sesion activa, no depende de ser Lara/Gio. El resto son exclusivos
// de Lara/Gio.
const OPEN_COMMANDS = new Set(['modelstatus', 'objecion', 'provider']);

export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (!OPEN_COMMANDS.has(commandName) && !isCreatorOrSubCreator(interaction.user)) {
    await interaction.reply({ content: 'ese comando solo lo pueden usar Lara o Gio', ephemeral: true });
    return;
  }

  try {
    if (TOGGLE_COMMANDS.has(commandName)) {
      await handleToggleCommand(interaction, commandName);
      return;
    }
    if (commandName === 'moderation') {
      await handleModerationCommand(interaction);
      return;
    }
    if (commandName === 'modelstatus') {
      await handleModelStatusCommand(interaction);
      return;
    }
    if (commandName === 'resetmemory') {
      await handleResetMemoryCommand(interaction);
      return;
    }
    if (commandName === 'funador') {
      await handleFunadorCommand(interaction);
      return;
    }
    if (commandName === 'objecion') {
      await handleObjecionCommand(interaction);
      return;
    }
    if (commandName === 'provider') {
      await handleProviderStatusCommand(interaction);
      return;
    }
  } catch (err) {
    console.error(`[interaction:${commandName}]`, err);
    const payload = { content: 'algo se rompio ejecutando eso, intenta de nuevo', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

export default { handleInteraction };
