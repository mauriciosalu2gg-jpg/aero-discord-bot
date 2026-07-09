import SYSTEM_PROMPT from '../../prompt.js';

export async function callOpenAI(apiKey, model, history, systemExtra = '') {
  if (!apiKey) throw new Error('OpenAI: sin API Key');

  const system = systemExtra
  ? `${SYSTEM_PROMPT}\n\n${systemExtra}`
  : SYSTEM_PROMPT;

  // URL configurable (OpenAI por defecto)
  const baseUrl =
  process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: system,
        },
        ...history,
      ],
    }),
  });

  const d = await res.json();

  if (!res.ok) {
    throw new Error(
      d.error?.message || `HTTP ${res.status}`
    );
  }

  return {
    text: d.choices?.[0]?.message?.content || '',
    tokens: d.usage?.total_tokens || 0,
  };
}
