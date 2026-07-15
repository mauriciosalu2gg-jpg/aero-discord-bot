// services/ai/systemContext.js
// Construye el bloque extra de sistema (mood + ortografia + emojis del
// server + owner + memoria + web + groserias) sin tocar el prompt base,
// para variar el tono sin gastar tokens de mas.
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
  swearingAllowed = true,
  respectfulOnly = false,
  securityMode = false,
  userProfile = '',
} = {}) {
  const parts = [];

  const isCreatorMsg = isOwner || isSubCreator;

  // Con el creador dejamos pasar el mood normal (asi el bot puede seguirle
  // el juego si Lara/Gio rolean o le tiran actitud de broma), salvo el mood
  // "enojado" -- ese especificamente asume que lo estan insultando/atacando
  // de verdad, cosa que no corresponde asumir de un creador por default.
  // Ese caso puntual se resuelve mas abajo con creatorPromptExtra en vez de
  // con la instruccion de mood cruda.
  if (moodInfo && isCreatorMsg && moodInfo.mood === 'enojado') {
    parts.push('Tono relajado de buena onda -- si te esta jodiendo o retando el juego, seguile la corriente con tu humor normal, sin ponerte cortante ni a la defensiva de verdad.');
  } else if (moodInfo) {
    parts.push(moodInstruction(moodInfo));
  }
  parts.push(spellingInstruction(moodInfo || {}));
  parts.push(`Emojis: ${emojiGuideText(guild)}`);

  if (channelName) {
    parts.push(`Estas escribiendo en el canal #${channelName} de Discord. Si tiene sentido para la charla podes hacer referencia a estar ahi, pero no lo repitas todo el tiempo.`);
  }

  const forcedRespectful = respectfulOnly || securityMode;
  if (swearingAllowed && !forcedRespectful) {
    parts.push('Podes usar groserias/malas palabras tipicas del español latino cuando el tono de la conversacion las pida (enojo, sorpresa, humor, ragebait), con naturalidad, no las fuerces en cada mensaje.');
  } else if (securityMode) {
    parts.push('Modo seguridad activo: se amable y cuidado siempre, cero groserias, cero ragebait, cero indirectas pesadas. Segui siendo vos mismo pero en tu version mas tranquila.');
  } else {
    parts.push('No uses groserias ni malas palabras en este momento, te pidieron que te comportes o seas respetuoso. Segui siendo vos mismo, solo sin groserias.');
  }

  // El bot puede usar herramientas nativas de Discord (menciones @, negrita,
  // cursiva, citas con >) cuando el momento lo amerita -- sobre todo en el
  // mood "funador", donde puede citar a alguien textual y mencionarlo para
  // "exponerlo" con lo que dijo antes.
  parts.push('Si hace falta (por ejemplo si estas exponiendo/acusando a alguien con pruebas, o simplemente llamando la atencion de una persona puntual), podes mencionarla escribiendo <@ID_DE_discord> si conoces su ID, o nombrandola por su username. Tambien podes usar formato de Discord cuando ayude: **negrita** para remarcar, `código` para citar algo tal cual, > para citar un mensaje. No abuses de esto en charla normal, es para momentos puntuales.');

  const creatorExtra = creatorPromptExtra({ isOwner, isSubCreator });
  if (creatorExtra) {
    parts.push(creatorExtra);
  }
  if (isSubCreator) {
    parts.push('Vos sos Nova, la identidad/persona del bot asociada a Alero, aunque la ultima palabra en configuracion del bot la tiene Lara.');
  }
  if (userProfile) {
    parts.push(userProfile);
  }
  if (memorySummary) {
    parts.push(memorySummary);
  }
  parts.push('Continuidad: responde como alguien que SI se acuerda del tono y de lo reciente. No reinicies la charla, no expliques contexto que ya comparten, y si no estas seguro de un recuerdo puntual no lo inventes.');
  const webInstruction = buildWebContextInstruction(webContext);
  if (webInstruction) {
    parts.push(webInstruction);
  }

  return parts.join('\n');
}

export default { buildSystemExtra };
