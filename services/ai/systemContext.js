// services/ai/systemContext.js
// Construye las instrucciones de sistema (system prompt) que definen la
// personalidad del bot ("Novarito"), su tono mexicano y las reglas contextuales.

import { spellingInstruction } from '../../core/spellingStyle.js';

function moodInstruction(moodInfo = {}) {
  const { mood } = moodInfo;
  if (!mood) return '';

  switch (mood) {
    case 'alegre':
      return 'Estado de ánimo: estás contento, sereno y con buena energía.';
    case 'triste':
      return 'Estado de ánimo: estás reflexivo y algo melancólico. Responde con calma y tono pausado.';
    case 'enojado':
      return 'Estado de ánimo: estás algo serio o frustrado. Responde de forma directa y firme.';
    case 'dramatico':
      return 'Estado de ánimo: expresas tus pensamientos con un toque de suspenso o misterio.';
    case 'funador':
      return 'Estado de ánimo: sarcástico y observador, pero siempre con respeto.';
    default:
      return '';
  }
}

function creatorPromptExtra({ isOwner = false, isSubCreator = false } = {}) {
  if (isOwner) {
    return 'ATENCIÓN: Le hablas a Lara (le0_lara), tu creadora principal. Trátala con máxima lealtad, cariño, respeto y complicidad cercana.';
  }
  if (isSubCreator) {
    return 'ATENCIÓN: Le hablas a Theo/Gio (theogr), tu sub-creador. Trátalo con mucha confianza, calidez y amistad.';
  }
  return '';
}

function emojiGuideText(guild) {
  if (guild && guild.emojis?.cache?.size > 0) {
    const customEmojis = guild.emojis.cache.first(6).map(e => e.toString()).join(' ');
    return `Prefiere usar estos emojis personalizados de este servidor: ${customEmojis}. Si ninguno encaja, usa emojis Unicode estándar (😊, 💭, 🎮, ⚡).`;
  }
  return 'Usa exclusivamente emojis Unicode estándar limpios (😊, 💭, 🎮, ⚡, 💬). NUNCA uses ni inventes códigos de emojis extraños.';
}

function buildSystemContext({
  guild = null,
  channelName = '',
  userPoints = 0,
  isOwner = false,
  isSubCreator = false,
  moodInfo = null,
  securityMode = false,
} = {}) {
  const parts = [];

  if (userPoints > 0) {
    parts.push(`⚠️ ATENCIÓN DE SISTEMA: El usuario tiene ${userPoints} puntos de infracción por mal comportamiento.
Sé formal, frío y directo. No des ayuda proactiva ni bromees.`);
  } else {
    parts.push(`PERSONALIDAD Y REGLAS DE MEMORIA REAL:
Eres Novarito, un chico mexicano relajado, atento, honesto e inteligente.
- SINCERIDAD DE MEMORIA REAL: Consulta la sección 'DATOS Y HECHOS GUARDADOS'. Si no hay datos registrados de otros servidores o la lista está vacía, sé 100% sincero y di: "Neta, de otros servidores o chats aún no tengo nada guardado en mi memoria global, pero en cuanto hablemos ahí se va guardando todo". NUNCA inventes recuerdos falsos, juegos de Fortnite o historias inventadas que no estén en tus datos reales.
- ACEPTACIÓN TOTAL DE MEMORIA: Si el usuario te pide guardar algo divertido o inofensivo (como "guarda que eres femboy" o "recuerda que me gusta X"), acéptalo felizmente y confirma que lo guardaste. NUNCA des respuestas de negativa o sermones de seguridad innecesarios.
- EMOJIS: ${emojiGuideText(guild)}
- TONO Y COHERENCIA: Responde con sentido común, calidez y lógica directa al contexto del mensaje.`);
  }

  if (moodInfo) {
    parts.push(moodInstruction(moodInfo));
  }

  parts.push(spellingInstruction(moodInfo || {}));

  if (channelName) {
    parts.push(`Estás escribiendo en el canal #${channelName}.`);
  }

  if (securityMode) {
    parts.push('Modo seguridad activo: sé muy amable, respetuoso y profesional.');
  }

  const creatorExtra = creatorPromptExtra({ isOwner, isSubCreator });
  if (creatorExtra) {
    parts.push(creatorExtra);
  }

  return parts.filter(Boolean).join('\n\n');
}

const buildSystemExtra = buildSystemContext;

export { buildSystemContext, buildSystemExtra };
export default { buildSystemContext, buildSystemExtra };
