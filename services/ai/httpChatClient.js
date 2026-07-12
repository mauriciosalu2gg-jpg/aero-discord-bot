// services/ai/httpChatClient.js
// Cliente HTTP compartido para proveedores compatibles con el esquema
// OpenAI /chat/completions (Groq, Cerebras, OpenRouter, HuggingFace router, etc).
// Evita duplicar el mismo fetch + manejo de errores en cada adaptador.

/**
 * Ejecuta una petición de chat completion contra un endpoint compatible con OpenAI.
 * @param {object} opts
 * @param {string} opts.url - Endpoint completo (.../chat/completions)
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array<{role:string, content:string}>} opts.messages
 * @param {number} [opts.maxTokens]
 * @param {object} [opts.extraHeaders]
 * @param {object} [opts.extraBody]
 * @returns {Promise<{text: string, tokens: number, raw: object}>}
 */
export async function chatCompletionsRequest({
  url,
  apiKey,
  model,
  messages,
  maxTokens = 500,
  extraHeaders = {},
  extraBody = {},
}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
      ...extraBody,
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error(`Respuesta no válida (HTTP ${res.status})`);
    err.statusCode = res.status;
    throw err;
  }

  if (!res.ok || data.error) {
    const message = data.error?.message || data.error || `HTTP ${res.status}`;
    const err = new Error(message);
    err.statusCode = res.status;
    const retryAfterHeader = res.headers.get('retry-after');
    if (retryAfterHeader) {
      const asSeconds = Number(retryAfterHeader);
      err.retryAfterMs = Number.isFinite(asSeconds)
        ? asSeconds * 1000
        : (new Date(retryAfterHeader).getTime() - Date.now());
      if (!Number.isFinite(err.retryAfterMs) || err.retryAfterMs < 0) err.retryAfterMs = null;
    }
    throw err;
  }

  return {
    text: data.choices?.[0]?.message?.content || '',
    tokens: data.usage?.total_tokens || 0,
    raw: data,
  };
}

export default { chatCompletionsRequest };
