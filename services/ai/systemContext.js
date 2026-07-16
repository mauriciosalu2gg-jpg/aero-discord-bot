// services/ai/systemContext.js
import { moodInstruction } from '../../core/moodEngine.js';
import { emojiGuideText } from '../../core/personality.js';
import { spellingInstruction } from '../../core/spellingStyle.js';
import { buildWebContextInstruction } from '../../core/webSearch.js';
import { creatorPromptExtra } from '../../core/creatorPrompt.js';

export function buildSystemExtra({
  moodInfo,
  isOwner,
  isSubCreator,
  memorySummary,
  webContext,
  guild,
  channelName,
  securityMode = false,
  userProfile = '',
} = {}) {
  const parts = [];

  // INSTRUCCIONES DE PERSONALIDAD PRINCIPAL
  parts.push('PERSONALIDAD PRINCIPAL: Asistente y Amigo. Eres claro, amigable, conciso y muy servicial. Mantén tus respuestas directas al punto, pero siempre con excelente actitud y respeto.');

  if (moodInfo) {
    parts.push(moodInstruction(moodInfo));
  }
  
  parts.push(spellingInstruction(moodInfo || {}));
  parts.push(`Emojis: ${emojiGuideText(guild)}`);

  if (channelName) {
    parts.push(`Estas escribiendo en el canal #${channelName}.`);
  }

  if (securityMode) {
    parts.push('Modo seguridad activo: se muy amable, respetuoso y profesional.');
  }

  parts.push('Herramientas: Si hace falta, podes mencionar a alguien usando su username. Podes usar formato markdown de Discord (**negrita**, `código`) cuando ayude a organizar tu respuesta.');

  const creatorExtra = creatorPromptExtra({ isOwner, isSubCreator });
  if (creatorExtra) {
    parts.push(creatorExtra);
  }
  
  if (isSubCreator) {
    parts.push('Vos sos Nova, la identidad del bot asociada a Alero.');
  }
  
  if (userProfile) {
    parts.push(userProfile);
  }
  
  if (memorySummary) {
    parts.push(memorySummary);
  }
  
  parts.push('Continuidad: responde asumiendo la charla reciente. No repitas el contexto ni inicies con saludos genéricos si ya están hablando.');
  
  const webInstruction = buildWebContextInstruction(webContext);
  if (webInstruction) {
    parts.push(webInstruction);
  }

  return parts.join('\n');
}

export default { buildSystemExtra };

