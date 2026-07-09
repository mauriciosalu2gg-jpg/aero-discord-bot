// core/contextAnalyzer.js
// Arma un objeto compacto de contexto a partir del mensaje actual y el
// historial reciente, para que moodEngine y aiManager decidan cómo responder.

export function analyzeContext(history, message, botUserId) {
  const content = message.content || '';
  const mentionsBot =
    content.includes(`<@${botUserId}>`) || content.includes(`<@!${botUserId}>`);

  // Si el mensaje menciona a otra persona (@alguien) y no es al bot,
  // asumimos que puede tratarse de algo dirigido a un tercero.
  const mentionsSomeoneElse = /<@!?\d+>/.test(content) && !mentionsBot;
  const targetsOther = mentionsSomeoneElse || /\b(el|ella)\b/i.test(content);

  const recentAuthors = [...new Set(history.slice(-6).map(h => h.authorName).filter(Boolean))];

  return {
    content,
    mentionsBot,
    targetsOther,
    recentAuthors,
    authorId: message.author?.id,
    authorName: message.author?.username,
    isOwnerMessage: false, // se completa en index.js con permissions.isOwner
  };
}

export default { analyzeContext };
