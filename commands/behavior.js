// commands/behavior.js
// Comandos explicitos para controlar groserias y datos curiosos autonomos.
// Solo Lara (owner) puede usarlos.
//   !calladito        -> apaga groserias Y datos curiosos autonomos
//   !ya puedes hablar  -> reactiva ambos
//   !groserias on/off  -> control fino de groserias
//   !datos on/off       -> control fino de datos curiosos autonomos

import { isCreatorOrSubCreator } from '../core/permissions.js';
import { setFlag } from '../core/behaviorFlags.js';

export async function handleCommand(message) {
  const content = message.content.trim().toLowerCase();
  const guildId = message.guild?.id || 'global';

  const isCalladito = content === '!calladito' || content === '!callate bot';
  const isResume = content === '!ya puedes hablar' || content === '!habla de nuevo';
  const isSwearCmd = content.startsWith('!groserias');
  const isFactsCmd = content.startsWith('!datos');

  if (!isCalladito && !isResume && !isSwearCmd && !isFactsCmd) return false;

  if (!isCreatorOrSubCreator(message.author)) {
    await message.reply('eso solo lo pueden tocar lara o gio');
    return true;
  }

  if (isCalladito) {
    setFlag(guildId, 'swearing', false);
    setFlag(guildId, 'factsAutoplay', false);
    await message.reply('ok, me porto bien y no hablo solo hasta que me digas 🫡');
    return true;
  }

  if (isResume) {
    setFlag(guildId, 'swearing', true);
    setFlag(guildId, 'factsAutoplay', true);
    await message.reply('volvi al modo normal');
    return true;
  }

  if (isSwearCmd) {
    const on = content.includes('on');
    setFlag(guildId, 'swearing', on);
    await message.reply(on ? 'ok, groserias activadas' : 'listo, sin groserias');
    return true;
  }

  if (isFactsCmd) {
    const on = content.includes('on');
    setFlag(guildId, 'factsAutoplay', on);
    await message.reply(on ? 'ok, vuelvo a tirar datos curiosos si el chat esta muerto' : 'listo, no interrumpo mas solo');
    return true;
  }

  return false;
}

export default { handleCommand };
