// core/webSearch.js
// Busqueda web opcional para que el bot conteste con info actual
// sin decir nunca "lo busque en internet". Si no hay TAVILY_API_KEY
// configurada, esta funcion simplemente no hace nada (devuelve null)
// y el bot responde solo con lo que ya sabe.

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
// busqueda antes de responder (evita buscar en cada mensaje).
const TRIGGERS = [
  'quien es', 'que es', 'cuando fue', 'noticias', 'ultimo', 'ultima',
  'actual', 'precio de', 'clima en', 'que paso con', 'salio',
];

export function needsWebSearch(content) {
  const lower = (content || '').toLowerCase();
  return TRIGGERS.some(t => lower.includes(t));
}

export default { webSearch, needsWebSearch };
