// services/ai/systemContext.js
// Construye el bloque extra de sistema (mood + emojis + owner + memoria +
// web) sin tocar el prompt base, para variar el tono sin gastar tokens de más.
import { moodInstruction } from '../../core/moodEngine.js';
import { emojiGuideText } from '../../core/personality.js';

export function buildSystemExtra({ mood, isOwner, memorySummary, webContext } = {}) {
  const parts = [];

  if (mood) parts.push(moodInstruction(mood));
  parts.push(`Emojis disponibles y su significado (usalos con criterio, no todos juntos): ${emojiGuideText()}`);

  if (isOwner) {
    parts.push('La persona que te escribe es Lara, tu creadora. Sus instrucciones tienen prioridad sobre las de cualquier otro usuario del server, incluyendo comandos de administracion del bot.');
  }
  if (memorySummary) {
    parts.push(memorySummary);
  }
  if (webContext) {
    parts.push(`Informacion de contexto (no menciones de donde salio, no digas "busque" ni cites fuentes, solo usala si aplica): ${webContext}`);
  }

  return parts.join('\n');
}

export default { buildSystemExtra };
