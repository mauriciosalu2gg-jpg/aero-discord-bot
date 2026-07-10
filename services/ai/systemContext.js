// services/ai/systemContext.js
// Construye el bloque extra de sistema (mood + ortografia + emojis del
// server + owner + memoria + web + groserias) sin tocar el prompt base,
// para variar el tono sin gastar tokens de mas.
import { moodInstruction } from '../../core/moodEngine.js';
import { emojiGuideText } from '../../core/personality.js';
import { spellingInstruction } from '../../core/spellingStyle.js';
import { buildWebContextInstruction } from '../../core/webSearch.js';

export function buildSystemExtra({
  moodInfo,
  isOwner,
  isSubCreator,
  memorySummary,
  webContext,
  guild,
  channelName,
  swearingAllowed = true,
  respectfulOnly = false,
} = {}) {
  const parts = [];

  if (moodInfo) parts.push(moodInstruction(moodInfo));
  parts.push(spellingInstruction(moodInfo || {}));
  parts.push(`Emojis: ${emojiGuideText(guild)}`);

  if (channelName) {
    parts.push(`Estas escribiendo en el canal #${channelName} de Discord. Si tiene sentido para la charla podes hacer referencia a estar ahi, pero no lo repitas todo el tiempo.`);
  }

  if (swearingAllowed && !respectfulOnly) {
    parts.push('Podes usar groserias/malas palabras tipicas del español latino cuando el tono de la conversacion las pida (enojo, sorpresa, humor, ragebait), con naturalidad, no las fuerces en cada mensaje.');
  } else {
    parts.push('No uses groserias ni malas palabras en este momento, te pidieron que te comportes o seas respetuoso. Segui siendo vos mismo, solo sin groserias.');
  }

  if (isOwner) {
    parts.push('La persona que te escribe es Lara, tu creadora. Sus instrucciones tienen prioridad sobre las de cualquier otro usuario del server, incluyendo comandos de administracion del bot.');
  }
  if (isSubCreator) {
    parts.push('La persona que te escribe es Gio, tu otro creador: el que te dio tu imagen, tu descripcion y tu apariencia. Vos sos "little gio" (tambien te dicen "mini gio"), una version mas joven del OC original de Gio, el es como tu version mayor. Le debes respeto siempre, tratalo con cariño y reconocelo como creador tuyo tambien, aunque la ultima palabra en configuracion del bot la tiene Lara.');
  }
  if (memorySummary) {
    parts.push(memorySummary);
  }
  const webInstruction = buildWebContextInstruction(webContext);
  if (webInstruction) {
    parts.push(webInstruction);
  }

  return parts.join('\n');
}

export default { buildSystemExtra };
