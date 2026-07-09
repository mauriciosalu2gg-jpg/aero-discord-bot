// commands/reset.js
// !reset            -> borra la memoria de ESE canal (admin u owner)
// !reset all        -> borra la memoria de TODOS los canales (solo owner/Lara)
// Devuelve true si el mensaje era un comando (para que index.js no siga
// procesandolo como charla normal), false si no.

import { resetMemory, resetAllMemory } from '../core/memory.js';
import { isOwner, isAdminOrHigher } from '../core/permissions.js';

export async function handleCommand(message) {
  const content = message.content.trim().toLowerCase();
  const isResetCmd = content.startsWith('!reset') || content.startsWith('!actualizar');
  if (!isResetCmd) return false;

  if (!isAdminOrHigher(message.author)) {
    await message.reply('no tenes permiso para eso we');
    return true;
  }

  if (content === '!reset all' || content === '!actualizar all') {
    if (!isOwner(message.author)) {
      await message.reply('eso solo lo puede hacer lara');
      return true;
    }
    await resetAllMemory();
    await message.reply('memoria de todos los canales reseteada ✅');
    return true;
  }

  await resetMemory(message.channelId);
  await message.reply('listo, memoria de este canal reseteada 🫡');
  return true;
}

export default { handleCommand };
