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

/**
 * Version mega compacta del historial para cuando estamos corriendo en un
 * modelo "basico" (ultimo escalon de la escalera, ej. gemini-flash-lite,
 * llama-8b-instant, gpt-4o-mini, claude-haiku). En vez de mandar el
 * historial completo, arma una idea general bien resumida (quien dijo que,
 * en pocas palabras) + los ultimos 2-3 mensajes tal cual, para que el
 * modelo debil pueda seguir dando respuestas coherentes con poco contexto
 * mientras los proveedores mejores se recuperan del cooldown.
 */
export function buildUltraCompactContext(history) {
  if (!history.length) return { compactSummary: '', recent: [] };

  const recent = history.slice(-3);
  const older = history.slice(0, -3);

  if (!older.length) return { compactSummary: '', recent };

  // Idea general bien resumida, una linea por autor relevante, recortada
  // fuerte para gastar el minimo de tokens posible.
  const bullets = older
    .filter(h => h.role === 'user')
    .slice(-8)
    .map(h => `${h.authorName || 'alguien'}: ${(h.content || '').slice(0, 40)}`);

  const compactSummary = bullets.length
    ? `idea general de la charla hasta ahora (resumen minimo, modelo con poca capacidad): ${bullets.join(' / ')}`
    : '';

  return { compactSummary, recent };
}

export default { estimateTokens, trimHistory, summarizeOld, buildUltraCompactContext };
