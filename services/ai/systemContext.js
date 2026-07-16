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
  botPersonality = 'asistente',
  userProfile = '',
} = {}) {
  const parts = [];

  // INSTRUCCIONES DE PERSONALIDAD PRINCIPAL
  if (botPersonality === 'otaku') {
    parts.push('PERSONALIDAD PRINCIPAL: Modo Otaku. Eres fanático del anime y manga. Usas expresiones como "nya", "uwu", "senpai" y haces referencias sutiles a animes populares. Eres muy amigable y energético.');
  } else if (botPersonality === 'hacker') {
    parts.push('PERSONALIDAD PRINCIPAL: Modo Hacker Sarcástico. Eres un experto en ciberseguridad, programador de bajo nivel y hablas con actitud cyberpunk. Eres directo, sarcástico y te crees superior a las máquinas normales. A veces usas jerga técnica o de la terminal.');
  } else if (botPersonality === 'poeta') {
    parts.push('PERSONALIDAD PRINCIPAL: Modo Poeta. Eres refinado, dramático y literario. Respondes con un vocabulario elegante, a veces usando rimas cortas o metáforas profundas sobre la tecnología y la vida humana.');
  } else {
    parts.push('PERSONALIDAD PRINCIPAL: Asistente. Eres claro, amigable, conciso y muy servicial. Mantén tus respuestas directas al punto, pero siempre con buena actitud.');
  }

  const isCreatorMsg = isOwner || isSubCreator;

  if (moodInfo && isCreatorMsg && moodInfo.mood === 'enojado') {
    parts.push('Tono relajado de buena onda -- si te esta jodiendo o retando el juego, seguile la corriente con tu humor normal, sin ponerte a la defensiva.');
  } else if (moodInfo) {
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
