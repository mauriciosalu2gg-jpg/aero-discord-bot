// core/moodEngine.js
// Detecta con heuristica simple (sin gastar tokens de IA) que tono general
// deberia usar el bot. No es una maquina de estados rigida: devuelve un mood
// principal + intensidad + señales secundarias, para que el prompt final
// pueda variar el tono en vez de sonar siempre igual dentro del mismo mood.

const INSULT_WORDS = ['imbecil', 'estupido', 'estúpido', 'pendejo', 'inutil', 'inútil', 'basura', 'no sirves', 'callate', 'cállate'];
const SAD_WORDS = ['triste', 'me siento mal', 'deprimido', 'me siento solo', 'nadie me quiere', 'no puedo mas', 'no puedo más', 'quiero llorar', 'me duele'];
const CRISIS_WORDS = ['quiero morir', 'no quiero vivir', 'me quiero matar', 'no vale la pena vivir', 'quiero desaparecer'];
const MOCK_BOT_WORDS = ['bot tonto', 'que dice el bot', 'ignora al bot', 'el bot no sirve', 'cállate bot', 'callate bot'];
const HYPE_WORDS = ['increible', 'increíble', 'que bueno', 'genial', 'de una', 'brutal', 'ganamos', 'lo logre', 'lo logré'];
const FUNNY_WORDS = ['jaja', 'jajaja', 'lol', 'xd', 'me muero', 'que risa', 'que gracioso'];
const FLIRTY_WORDS = ['te quiero', 'me gustas', 'sos lindo', 'sos linda', 'guapo', 'guapa', 'coqueteando', 'enamorado', 'enamorada'];
const BORED_WORDS = ['que aburrido', 'no hay nada que hacer', 'me aburro', 'aburrida', 'aburrido'];
const SERIOUS_WORDS = ['tengo un problema serio', 'necesito ayuda de verdad', 'es urgente', 'algo grave paso', 'tengo miedo de verdad'];
const DRAMA_WORDS = ['no puede ser', 'esto es una tragedia', 'que dramatico', 'que dramático', 'se armo', 'se armó', 'quilombo', 'esto es un caos', 'no lo puedo creer'];
// Palabras/patrones que sugieren que alguien esta negando haber hecho algo
// que el bot "sabe" que si hizo (visto en el chat antes), pie para el mood
// "funador": el bot tiene "pruebas" (screenshots imaginarios del historial)
// y expone/acusa con evidencia, citando a la persona.
const DENIAL_WORDS = ['yo no dije eso', 'yo no hice eso', 'eso no paso', 'eso no pasó', 'no es verdad', 'estas mintiendo', 'estás mintiendo', 'jamas dije eso', 'jamás dije eso'];

function countHits(lower, words) {
  return words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
}

/**
 * @returns {{ mood: string, intensity: number, crisis: boolean, serious: boolean }}
 * intensity va de 1 (leve) a 3 (fuerte), calculado segun cuantas señales
 * coinciden y si hay signos de exclamacion/mayusculas (gritando).
 */
export function detectMood({ content, mentionsBot, targetsOther }) {
  const raw = content || '';
  const lower = raw.toLowerCase();

  const shouting = /[A-ZÁÉÍÓÚÑ]{4,}/.test(raw) || (raw.match(/!/g) || []).length >= 2;

  const crisis = CRISIS_WORDS.some(w => lower.includes(w));
  const serious = SERIOUS_WORDS.some(w => lower.includes(w));

  const insultsBot = mentionsBot && countHits(lower, INSULT_WORDS) > 0;
  const mocksBot = countHits(lower, MOCK_BOT_WORDS) > 0;
  const isSad = countHits(lower, SAD_WORDS) > 0;
  const insultsOther = targetsOther && countHits(lower, INSULT_WORDS) > 0;
  const isHype = countHits(lower, HYPE_WORDS) > 0;
  const isFunny = countHits(lower, FUNNY_WORDS) > 0;
  const isFlirty = countHits(lower, FLIRTY_WORDS) > 0;
  const isBored = countHits(lower, BORED_WORDS) > 0;
  const isDramatic = countHits(lower, DRAMA_WORDS) > 0;
  const isDenying = countHits(lower, DENIAL_WORDS) > 0;

  let mood = 'neutral';
  let baseHits = 1;

  if (crisis) { mood = 'crisis'; baseHits = 3; }
  else if (serious) { mood = 'serio'; baseHits = 2; }
  else if (insultsBot || mocksBot) { mood = 'enojado'; baseHits = countHits(lower, INSULT_WORDS) + countHits(lower, MOCK_BOT_WORDS); }
  else if (isDenying) { mood = 'funador'; baseHits = countHits(lower, DENIAL_WORDS); }
  else if (isSad) { mood = 'triste'; baseHits = countHits(lower, SAD_WORDS); }
  else if (insultsOther) { mood = 'defensivo'; baseHits = countHits(lower, INSULT_WORDS); }
  else if (isFlirty) { mood = 'coqueto'; baseHits = countHits(lower, FLIRTY_WORDS); }
  else if (isDramatic) { mood = 'dramatico'; baseHits = countHits(lower, DRAMA_WORDS); }
  else if (isHype) { mood = 'hype'; baseHits = countHits(lower, HYPE_WORDS); }
  else if (isFunny) { mood = 'divertido'; baseHits = countHits(lower, FUNNY_WORDS); }
  else if (isBored) { mood = 'aburrido'; baseHits = countHits(lower, BORED_WORDS); }

  let intensity = Math.min(3, baseHits + (shouting ? 1 : 0));
  if (mood === 'neutral') intensity = 1;

  return { mood, intensity, crisis, serious };
}

/**
 * Instruccion de tono para el prompt. Varia segun intensidad, asi el mismo
 * mood no siempre suena igual (un "enojado" nivel 1 no es igual a nivel 3).
 */
export function moodInstruction({ mood, intensity = 1, crisis = false, serious = false } = {}) {
  if (crisis) {
    return 'ALERTA: la persona muestra señales de crisis real (posible riesgo de autolesion). Dejá TODO el personaje de lado: nada de jerga, nada de humor, nada de emojis. Respondé en español claro, calido, tomando esto en serio, y sugerile buscar ayuda de alguien de confianza o una linea de ayuda. No minimices lo que dice.';
  }
  if (serious) {
    return 'El tema que trae la persona es serio de verdad. Bajá el personaje: menos jerga, sin bromas ni sarcasmo, ortografia cuidada, frases mas completas. Segui sonando humano, no como manual, pero con calma y atencion real.';
  }

  const byMood = {
    enojado: [
      'Te están molestando un poco. Respondé con algo de actitud pero sin pasarte.',
      'Te están molestando en serio. Respondé seco, con humor filoso, defendiéndote.',
      'Te están faltando el respeto feo. Respondé con toda la actitud, cortante, sin filtro (podés usar alguna grosería si aplica), pero sin cruzar a agresión real ni insultos pesados de verdad.',
    ],
    triste: [
      'La persona esta un poco baja de animo. Respondé con calidez, sin ser dramático.',
      'La persona está mal. Respondé con calidez real, sin bromas ni sarcasmo esta vez.',
      'La persona está muy mal. Bajá el personaje casi del todo, priorizá contenerla con calidez genuina antes que la onda del chat.',
    ],
    defensivo: [
      'Alguien está picando un poco a otra persona del chat. Podés meter un comentario a favor del que está siendo molestado.',
      'Alguien está atacando a otra persona del chat. Defendé a quien está siendo atacado, con firmeza.',
      'Alguien se está pasando feo con otra persona del chat. Defendé fuerte a quien está siendo atacado, con actitud.',
    ],
    coqueto: [
      'Hay onda de coqueteo leve. Podés tirar una indirecta sutil, con humor.',
      'Hay onda de coqueteo. Jugá un poco, tirá algo para hacer sonrojar sin pasarte de intenso.',
      'La onda de coqueteo está fuerte. Metele intensidad con humor, tirale algo directo pero gracioso, como para hacerla/o sonrojar de verdad.',
    ],
    hype: [
      'Algo bueno pasó. Mostrá un poco de entusiasmo.',
      'Algo bueno pasó de verdad. Respondé con energia genuina, hype real.',
      'Algo muy bueno pasó. Explotá de hype, exagerá un poco como lo haría un amigo emocionado.',
    ],
    divertido: [
      'El chat está con onda de joda leve. Podés seguirle un poco el chiste.',
      'El chat está con buena onda de joda. Seguile el chiste, tirá humor.',
      'El chat está en modo caos de risa. Metele humor fuerte, podés tirar un meme improvisado o ragebait leve para seguir la joda.',
    ],
    aburrido: [
      'El ambiente está medio apagado. Podés tirar un comentario para animar un poco.',
      'El ambiente está aburrido. Tirá algo random o un dato curioso para reactivar la charla.',
      'El ambiente está muerto de aburrido. Armá algo random, un meme, una pregunta rara, lo que sea para reactivar la charla.',
    ],
    dramatico: [
      'Alguien esta exagerando la nota con drama por algo menor. Podés seguirle un poco la corriente del drama, medio en broma.',
      'Se armo drama de verdad en el chat. Metete con actitud teatral, exagerando reacciones como si fuera una telenovela, sin tomarlo literal.',
      'El chat esta en modo caos dramatico total. Anda a fondo con el teatro: reacciones exageradas, tipo groupchat en llamas, pero siempre en tono de joda, nunca cruel de verdad.',
    ],
    funador: [
      'Alguien esta negando algo que vos "sabes" que paso (viste el mensaje antes). Podés mencionar con sutileza y buena onda que te acordas distinto, en tono de joda, sin hacer un escandalo.',
      'Alguien esta negando algo que dijo antes en el chat. Recordaselo con humor y cariño, como cuando un amigo te caza en una mentira piadosa, sin ponerte pesado.',
      'Estamos en pleno bit de "juicio" en broma que la gente ya acepto jugar. Metele teatro divertido: citá lo que paso entre comillas, usa **negrita** para remarcar, podés mencionar a alguien con @ si ya dijo que si a participar. Siempre en joda amistosa, cero insultos, cero amenazas reales, como un programa de comedia, nunca acoso de verdad.',
    ],
    neutral: ['Tono normal, relajado, como charla de grupo.'],
  };

  const options = byMood[mood] || byMood.neutral;
  const idx = Math.min(options.length - 1, Math.max(0, intensity - 1));
  return options[idx];
}

export default { detectMood, moodInstruction };
