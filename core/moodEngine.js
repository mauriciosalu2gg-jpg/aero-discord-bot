// core/moodEngine.js
// Detecta con heuristica simple (sin gastar tokens de IA) que tono general
// deberia usar el bot. Solo detecta emociones neutrales o positivas/de soporte
// para garantizar un trato 100% respetuoso.

const SAD_WORDS = ['triste', 'me siento mal', 'deprimido', 'me siento solo', 'nadie me quiere', 'no puedo mas', 'no puedo más', 'quiero llorar', 'me duele'];
const CRISIS_WORDS = ['quiero morir', 'no quiero vivir', 'me quiero matar', 'no vale la pena vivir', 'quiero desaparecer'];
const HYPE_WORDS = ['increible', 'increíble', 'que bueno', 'genial', 'de una', 'brutal', 'ganamos', 'lo logre', 'lo logré'];
const FUNNY_WORDS = ['jaja', 'jajaja', 'lol', 'xd', 'me muero', 'que risa', 'que gracioso'];
const FLIRTY_WORDS = ['te quiero', 'me gustas', 'sos lindo', 'sos linda', 'guapo', 'guapa', 'coqueteando', 'enamorado', 'enamorada'];
const BORED_WORDS = ['que aburrido', 'no hay nada que hacer', 'me aburro', 'aburrida', 'aburrido'];
const SERIOUS_WORDS = ['tengo un problema serio', 'necesito ayuda de verdad', 'es urgente', 'algo grave paso', 'tengo miedo de verdad'];

function countHits(lower, words) {
  return words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
}

export function detectMood({ content }) {
  const raw = content || '';
  const lower = raw.toLowerCase();

  const shouting = /[A-ZÁÉÍÓÚÑ]{4,}/.test(raw) || (raw.match(/!/g) || []).length >= 2;

  const crisis = CRISIS_WORDS.some(w => lower.includes(w));
  const serious = SERIOUS_WORDS.some(w => lower.includes(w));

  const isSad = countHits(lower, SAD_WORDS) > 0;
  const isHype = countHits(lower, HYPE_WORDS) > 0;
  const isFunny = countHits(lower, FUNNY_WORDS) > 0;
  const isFlirty = countHits(lower, FLIRTY_WORDS) > 0;
  const isBored = countHits(lower, BORED_WORDS) > 0;

  let mood = 'neutral';
  let baseHits = 1;

  if (crisis) { mood = 'crisis'; baseHits = 3; }
  else if (serious) { mood = 'serio'; baseHits = 2; }
  else if (isSad) { mood = 'triste'; baseHits = countHits(lower, SAD_WORDS); }
  else if (isFlirty) { mood = 'coqueto'; baseHits = countHits(lower, FLIRTY_WORDS); }
  else if (isHype) { mood = 'hype'; baseHits = countHits(lower, HYPE_WORDS); }
  else if (isFunny) { mood = 'divertido'; baseHits = countHits(lower, FUNNY_WORDS); }
  else if (isBored) { mood = 'aburrido'; baseHits = countHits(lower, BORED_WORDS); }

  let intensity = Math.min(3, baseHits + (shouting ? 1 : 0));
  if (mood === 'neutral') intensity = 1;

  return { mood, intensity, crisis, serious };
}

export function moodInstruction({ mood, intensity = 1, crisis = false, serious = false } = {}) {
  if (crisis) {
    return 'ALERTA: la persona muestra señales de crisis real (posible riesgo de autolesion). Dejá TODO el personaje de lado. Respondé en español claro, calido, tomando esto en serio, y sugerile buscar ayuda de alguien de confianza o una linea de ayuda. No minimices lo que dice.';
  }
  if (serious) {
    return 'El tema que trae la persona es serio de verdad. Bajá el personaje: sin bromas ni sarcasmo, ortografia cuidada. Segui sonando humano, con calma y atencion real.';
  }

  const byMood = {
    triste: [
      'La persona esta un poco baja de animo. Respondé con calidez, sin ser dramático.',
      'La persona está mal. Respondé con calidez real, sin bromas ni sarcasmo esta vez.',
      'La persona está muy mal. Bajá el personaje casi del todo, priorizá contenerla con calidez genuina.',
    ],
    coqueto: [
      'Hay onda de coqueteo leve. Podés tirar una indirecta sutil, amable.',
      'Hay onda de coqueteo. Jugá un poco de forma dulce, sin ser invasivo.',
      'La onda de coqueteo está fuerte. Metele humor dulce, tirale algo simpático para seguir el juego sano.',
    ],
    hype: [
      'Algo bueno pasó. Mostrá un poco de entusiasmo.',
      'Algo bueno pasó de verdad. Respondé con energia genuina, hype real.',
      'Algo muy bueno pasó. Explotá de hype, alegrate mucho por la persona.',
    ],
    divertido: [
      'El chat está con onda alegre. Podés seguirle un poco el chiste.',
      'El chat está con buena onda. Seguile el chiste, tirá humor sano.',
      'El chat está en modo risa total. Metele humor sano y divertido.',
    ],
    aburrido: [
      'El ambiente está medio apagado. Podés tirar un comentario amable para animar un poco.',
      'El ambiente está aburrido. Tirá algo random o un dato curioso para reactivar la charla de buena forma.',
      'El ambiente está aburrido. Armá algo random, una pregunta interesante, lo que sea para reactivar la charla positivamente.',
    ],
    neutral: ['Tono amable, relajado, como charla amistosa y respetuosa.'],
  };

  const options = byMood[mood] || byMood.neutral;
  const idx = Math.min(options.length - 1, Math.max(0, intensity - 1));
  return options[idx];
}

export default { detectMood, moodInstruction };

