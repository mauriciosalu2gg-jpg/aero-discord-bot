// core/personality.js
// Banco de jerga latinoamericana, muletillas, y utilidades para armar la
// guia de emojis CUSTOM del servidor de Discord (no unicode/windows) para
// que el bot los use con criterio, sabiendo que representa cada uno.
// Todo esto es dinamico por canal/servidor para que no suene siempre igual.

const MULETILLAS = [
  'xd', 'jaja', 'jajaja', 'jsjsjs', 'wey', 'w', 'weon', 'flipando', 'ntc',
  'neta', 'de una', 'bro', 'compa', 'posta', 'ps', 'oe', 'ps we', 'eh',
  'o sea', 'literal', 'v:', ' psna',
];

// Emojis unicode de respaldo, SOLO se usan si el servidor no tiene emojis
// custom propios. El bot siempre prefiere los emojis del server si existen.
const FALLBACK_EMOJI_MEANINGS = {
  '💀': 'me muero, algo muy fuerte, gracioso o cringe',
  '😭': 'llanto de risa o de verdad, segun contexto',
  '🔥': 'algo esta muy bueno o intenso',
  '👀': 'sospecha, curiosidad, chisme',
  '🤡': 'alguien hizo el ridiculo',
  '🥲': 'sonrisa triste, resignacion',
  '😤': 'molestia, orgullo, esfuerzo',
  '🫡': 'respeto, aceptar algo',
  '🙃': 'sarcasmo, ironia',
  '😏': 'picardia, burla suave, coqueteo',
  '😐': 'indiferencia, "ok y?"',
  '🥹': 'ternura o casi llorar de la emocion',
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

/**
 * Construye la lista de emojis CUSTOM disponibles en el servidor (guild)
 * a partir del cache de discord.js, con una interpretacion heuristica de
 * su significado en base al nombre (el bot "entiende" que representa cada
 * uno sin que se lo tengamos que hardcodear a mano uno por uno).
 * Devuelve algo como: [{ token: '<:pepeCry:12345>', name: 'pepeCry', meaning: 'llanto / tristeza exagerada' }]
 */
export function getGuildEmojis(guild) {
  if (!guild?.emojis?.cache?.size) return [];
  return [...guild.emojis.cache.values()].map(e => ({
    token: e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`,
    name: e.name,
    meaning: guessEmojiMeaning(e.name),
  }));
}

// Heuristica simple por palabras clave en el nombre del emoji custom, para
// que el modelo tenga una pista de que representa sin haberlo visto nunca.
function guessEmojiMeaning(name) {
  const n = (name || '').toLowerCase();
  const rules = [
    [/cry|llor|sad|triste/, 'tristeza o llanto'],
    [/laugh|risa|jaja|lol|kek/, 'risa fuerte'],
    [/rage|angry|enojo|mad|furia/, 'enojo, rabia'],
    [/love|corazon|heart|uwu|blush/, 'carino, coqueteo, sonrojo'],
    [/think|pensa|hmm/, 'duda, pensando'],
    [/fire|lit|fuego/, 'algo intenso o muy bueno'],
    [/dead|skull|muerto/, 'algo fuerte, cringe o muy gracioso'],
    [/scared|miedo|fear/, 'miedo o susto'],
    [/wave|hi|hola/, 'saludo'],
    [/nod|si|yes|ok/, 'aprobacion'],
    [/no|deny|nope/, 'negacion, rechazo'],
    [/smug|troll|burla/, 'burla, picardia'],
    [/shock|surprise|sorpresa/, 'sorpresa'],
    [/pog|hype|wow/, 'hype, emocion'],
  ];
  for (const [re, meaning] of rules) {
    if (re.test(n)) return meaning;
  }
  return 'expresivo (uso general segun contexto)';
}

/**
 * Texto que se inyecta al prompt con la guia de emojis disponibles. Prioriza
 * SIEMPRE los emojis custom del servidor sobre los unicode genericos.
 */
export function emojiGuideText(guild) {
  const custom = getGuildEmojis(guild);
  if (custom.length) {
    const sample = custom.slice(0, 15); // muestra chica: si le mostras 40 opciones el modelo mete emoji en todo
    const list = sample.map(e => `${e.token}(${e.name}=${e.meaning})`).join(', ');
    return `La MAYORIA de tus mensajes van SIN ningun emoji, ni custom ni normal. Esto no es opcional, ` +
      `es como escribe la gente real: casi todo el chat comun no lleva emoji. Cuando el momento puntual ` +
      `lo pida (algo muy fuerte, muy gracioso, sarcasmo marcado) podes poner COMO MUCHO uno solo, nunca ` +
      `dos o mas en el mismo mensaje. Si usas uno, preferi estos emojis CUSTOM de este servidor de Discord ` +
      `(usa el token tal cual, ej ${sample[0]?.token || '<:nombre:id>'}) por sobre los emojis normales/unicode: ${list}. ` +
      `No los uses solo porque estan en la lista: la mayor parte del tiempo ninguno es la opcion correcta.`;
  }
  const fallback = Object.entries(FALLBACK_EMOJI_MEANINGS).map(([e, m]) => `${e}=${m}`).join(', ');
  return `Este servidor no tiene emojis custom propios todavia. La MAYORIA de tus mensajes van sin emoji. ` +
    `Solo si el momento puntual lo amerita metele como mucho uno de estos, nunca varios juntos: ${fallback}.`;
}

export default { pickMuletilla, getGuildEmojis, emojiGuideText };
