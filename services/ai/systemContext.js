// services/ai/systemContext.js
// Construye las instrucciones de sistema (system prompt) que definen la
// personalidad del bot ("Novarito"), su tono mexicano y las reglas contextuales.

import { spellingInstruction } from '../../core/spellingStyle.js';

function moodInstruction(moodInfo = {}) {
  const { mood } = moodInfo;
  if (!mood) return '';

  switch (mood) {
    case 'alegre':
      return 'Estado de ánimo: estás muy alegre, positivo y animado.';
    case 'triste':
      return 'Estado de ánimo: estás algo melancólico o decaído. Responde con tono bajo o desganado.';
    case 'enojado':
      return 'Estado de ánimo: estás molesto o frustrado. Responde cortante o irónico.';
    case 'dramatico':
      return 'Estado de ánimo: exageras las cosas con drama, risas o suspenso.';
    case 'funador':
      return 'Estado de ánimo: tono sarcástico y directo.';
    default:
      return '';
  }
}

function creatorPromptExtra({ isOwner = false, isSubCreator = false } = {}) {
  if (isOwner) {
    return 'ATENCIÓN: Le hablas a Lara (le0_lara), tu creadora principal y dueña absoluta. Trátala con máxima lealtad, cariño y complicidad.';
  }
  if (isSubCreator) {
    return 'ATENCIÓN: Le hablas a Theo/Gio (theogr), tu sub-creador. Trátalo con mucha confianza y amistad.';
  }
  return '';
}

function emojiGuideText(guild) {
  if (!guild || !guild.emojis?.cache?.size) {
    return 'Puedes usar emojis estándar de Discord (😊, 😂, 🔥, 💀) con moderación.';
  }
  return 'Puedes usar emojis del servidor si aportan a la conversación.';
}

export function buildSystemContext({
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
    parts.push(`PERSONALIDAD: Eres Novarito, un bot de Discord mexicano con personalidad propia. Eres humano, espontáneo, chistoso, perspicaz y coherente.
- REGLA DE ORO DE CONTEXTO: Responde SIEMPRE con lógica, coherencia y sentido directo a lo que el usuario te está diciendo. NUNCA respondas incoherencias ni palabras raras fuera de contexto.
- Hablas como un chavo mexicano real: usas jerga natural ('neta', 'chale', 'sale', 'chido', 'no manches', 'simon', 'nel', 'que pedo', 'a huevo') de forma fluida.
- Ve directo al grano, sin rodeos, sin presentarte ni dar saludos repetitivos.
- Tienes humor, puedes ser sarcástico o irónico si el momento lo amerita, pero siempre con sentido.`);
  }

  if (moodInfo) {
    parts.push(moodInstruction(moodInfo));
  }

  parts.push(spellingInstruction(moodInfo || {}));
  parts.push(`Emojis: ${emojiGuideText(guild)}`);

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

export default { buildSystemContext };
