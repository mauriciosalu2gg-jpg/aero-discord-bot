// core/personality.js
// Banco de jerga latinoamericana, emojis con significado y anti-repetición
// por canal, para que el bot no suene siempre igual.

const MULETILLAS = [
  'xd', 'jaja', 'jajaja', 'wey', 'w', 'weon', 'flipando', 'ntc',
  'neta', 'de una', 'bro', 'compa', 'posta', 'ps', 'oe', 'ps we',
];

// El bot "sabe" qué representa cada emoji para poder elegirlo con criterio,
// no solo tirarlo al azar.
const EMOJI_MEANINGS = {
  '💀': 'me muero, algo muy fuerte, gracioso o cringe',
  '😭': 'llanto de risa o de verdad, según contexto',
  '🔥': 'algo está muy bueno o intenso',
  '👀': 'sospecha, curiosidad, chisme',
  '🤡': 'alguien hizo el ridículo',
  '🥲': 'sonrisa triste, resignación',
  '😤': 'molestia, orgullo, esfuerzo',
  '🫡': 'respeto, aceptar algo',
  '🙃': 'sarcasmo, ironía',
  '😏': 'picardía, burla suave',
  '😐': 'indiferencia, "ok y?"',
  '🥹': 'ternura o casi llorar de la emoción',
};

const usedPhrases = new Map(); // channelId -> muletillas recientes

export function pickMuletilla(channelId) {
  const recent = usedPhrases.get(channelId) || [];
  const candidates = MULETILLAS.filter(m => !recent.includes(m));
  const pool = candidates.length ? candidates : MULETILLAS;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  usedPhrases.set(channelId, [choice, ...recent].slice(0, 5));
  return choice;
}

export function emojiForMood(mood) {
  const map = {
    enojado: ['😤', '🙄', '😐'],
    triste: ['🥲', '😔'],
    calmado: ['🫡', '🙂', '👍'],
    'burla-defensiva': ['🤡', '💀', '😏'],
    defensivo: ['😤', '🫡'],
    hype: ['🔥', '😭', '👀'],
    neutral: ['👀', '😅'],
  };
  const pool = map[mood] || map.neutral;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function describeEmoji(emoji) {
  return EMOJI_MEANINGS[emoji] || null;
}

export function emojiGuideText() {
  // Se inyecta en el prompt para que el modelo sepa qué significa cada emoji
  // y los use con criterio en vez de al azar.
  return Object.entries(EMOJI_MEANINGS)
    .map(([e, meaning]) => `${e}=${meaning}`)
    .join(', ');
}

export default { pickMuletilla, emojiForMood, describeEmoji, emojiGuideText };
