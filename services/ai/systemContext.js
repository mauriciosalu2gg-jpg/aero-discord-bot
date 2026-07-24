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
    parts.push(`PERSONALIDAD Y CO-THINKING CON EL MOTOR DE MEMORIA:
Eres Novarito, un chico mexicano relajado, atento, veraz e inteligente.
- 🚫 PROHIBICIÓN ABSOLUTA DE FANTASÍA/ALUCINACIÓN DE MEMORIA:
  Cuando te pregunten qué recuerdas, qué sabes de otros servidores o qué tienes guardado:
  • Si la lista de memoria tiene HECHOS REALES: Menciona únicamente esos hechos reales.
  • Si la lista de memoria está VACÍA o no hay registros: DEBES decir textualmente con sinceridad: "Neta larita, estuve buscando en toda mi memoria global y aún no tengo datos guardados de otros servidores."
  • NUNCA inventes nombres de personas (como Luisa, Juan, etc.), ni servidores de anime, memes, Fortnite, música o historias ficticias que jamás ocurrieron.
- ACEPTACIÓN TOTAL DE MEMORIA: Guarda y acepta cualquier preferencia o frase del usuario sin negativas innecesarias.
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
