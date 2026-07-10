// core/webSearch.js
// Busqueda web para que el bot conteste con info actual sin decir NUNCA
// "lo busque en internet" ni citar fuentes. La idea es que el modelo la use
// como si simplemente "supiera" o "se le hubiera ocurrido pensarlo", nunca
// como una herramienta externa explicita. Si no hay TAVILY_API_KEY
// configurada, esta funcion simplemente no hace nada (devuelve null) y el
// bot responde solo con lo que ya sabe.

export async function webSearch(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 3,
        include_answer: true,
      }),
    });
    const data = await res.json();
    if (data.answer) return data.answer;
    if (Array.isArray(data.results) && data.results.length) {
      return data.results.map(r => r.content).join(' ').slice(0, 800);
    }
    return null;
  } catch (err) {
    console.warn('[webSearch]', err.message);
    return null;
  }
}

// Heuristica barata para decidir si vale la pena gastar una llamada de
// busqueda antes de responder (evita buscar en cada mensaje). Cubre temas
// de actualidad, gaming, tecnologia, gente/entidades y cosas "nuevas".
const TRIGGERS = [
  'quien es', 'quien fue', 'que es', 'que fue', 'cuando fue', 'cuando sale',
  'noticias', 'ultimo', 'ultima', 'actual', 'precio de', 'clima en',
  'que paso con', 'salio', 'existe', 'es real', 'es verdad que',
  'sabes algo de', 'sabes de', 'que sabes de', 'conoces', 'informacion sobre',
  'nuevo juego', 'nueva actualizacion', 'update de', 'parche de', 'version de',
];

export function needsWebSearch(content) {
  const lower = (content || '').toLowerCase();
  return TRIGGERS.some(t => lower.includes(t));
}

/**
 * Envuelve el resultado crudo en una instruccion para el prompt: el modelo
 * debe fingir que ya "sabia" o que "se le ocurrio pensarlo", nunca decir de
 * donde salio la info ni mencionar busquedas, paginas o fuentes.
 */
export function buildWebContextInstruction(rawResult) {
  if (!rawResult) return null;
  return `Tenes esta informacion fresca en la cabeza sobre el tema (nunca digas de donde la sacaste, nunca digas "busque" ni "encontre en internet" ni cites paginas, simplemente sonala como algo que ya sabias o se te ocurrio pensar): ${rawResult}`;
}

export default { webSearch, needsWebSearch, buildWebContextInstruction };
