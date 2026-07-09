// core/tokenOptimizer.js
// Recorta y resume el historial de forma heurística (SIN llamar a la IA)
// para no gastar tokens extra solo en armar el contexto.

const KEEP_RECENT = 8;

export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// Se queda con los mensajes más recientes que entren en el presupuesto de tokens.
export function trimHistory(history, maxTokens = 3000) {
  let total = 0;
  const out = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const t = estimateTokens(history[i].content);
    if (total + t > maxTokens) break;
    out.unshift(history[i]);
    total += t;
  }
  return out.length ? out : history.slice(-KEEP_RECENT);
}

// Resumen barato (sin IA) de los mensajes viejos, para no perder contexto
// de largo plazo sin mandar todo el historial completo cada vez.
export function summarizeOld(history, keepRecent = KEEP_RECENT) {
  if (history.length <= keepRecent) return { summary: '', recent: history };

  const old = history.slice(0, history.length - keepRecent);
  const recent = history.slice(-keepRecent);

  const topics = old
    .filter(h => h.role === 'user')
    .map(h => h.content.slice(0, 50))
    .slice(-6);

  const summary = topics.length
    ? `contexto previo: se habló de -> ${topics.join(' | ')}`
    : '';

  return { summary, recent };
}

export default { estimateTokens, trimHistory, summarizeOld };
