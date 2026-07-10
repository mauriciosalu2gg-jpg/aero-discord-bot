// core/messageSplitter.js
// A veces divide la respuesta en varios mensajes separados (2, 3 o incluso
// mas), como escribe alguien real que va soltando ideas de a poco en vez de
// mandar un parrafo unico. No siempre pasa, para que no se sienta forzado,
// y la probabilidad/cantidad varia segun el mood (mas caotico = mas partes).

export function splitHumanized(text, moodInfo = {}) {
  const clean = (text || '').trim();
  if (!clean) return ['...'];

  const { mood, intensity = 1 } = moodInfo;
  const chaotic = ['divertido', 'hype', 'coqueto', 'enojado'].includes(mood) && intensity >= 2;

  const splitChance = chaotic ? 0.45 : 0.28;
  const shouldSplit = Math.random() < splitChance && clean.length > 40;
  if (!shouldSplit) return [clean];

  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2) return [clean];

  const maxChunks = chaotic ? Math.min(4, sentences.length) : Math.min(3, sentences.length);
  const chunkCount = Math.max(2, maxChunks);
  const perChunk = Math.ceil(sentences.length / chunkCount);

  const parts = [];
  for (let i = 0; i < sentences.length; i += perChunk) {
    const part = sentences.slice(i, i + perChunk).join(' ').trim();
    if (part) parts.push(part);
  }

  return parts;
}

/**
 * Delay entre partes de un mensaje fragmentado, para que no se manden todas
 * de golpe (como si las estuviera tipeando una por una).
 */
export function delayBetweenParts() {
  return 500 + Math.random() * 1400;
}

export default { splitHumanized, delayBetweenParts };
