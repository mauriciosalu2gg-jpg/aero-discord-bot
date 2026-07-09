// core/messageSplitter.js
// A veces divide la respuesta en 2-3 mensajes separados, como en la imagen
// de referencia (mensaje corto + emoji suelto, etc). No siempre, para que
// no se sienta forzado.

export function splitHumanized(text) {
  const clean = (text || '').trim();
  if (!clean) return ['...'];

  const shouldSplit = Math.random() < 0.3 && clean.length > 50;
  if (!shouldSplit) return [clean];

  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2) return [clean];

  const chunkCount = sentences.length > 4 ? 3 : 2;
  const perChunk = Math.ceil(sentences.length / chunkCount);

  const parts = [];
  for (let i = 0; i < sentences.length; i += perChunk) {
    const part = sentences.slice(i, i + perChunk).join(' ').trim();
    if (part) parts.push(part);
  }

  return parts;
}

export default { splitHumanized };
