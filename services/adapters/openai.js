// services/adapters/openai.js
import SYSTEM_PROMPT from '../../prompt.js';
import { getMaxTokens } from '../../config/providers.js';

export async function callOpenAI(apiKey, model, history, systemExtra = '', intent = 'chat') {
  if (!apiKey) throw new Error('OpenAI: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: getMaxTokens('openai', intent),
      messages: [{ role: 'system', content: system }, ...history],
    }),
  });

  const d = await res.json();
  if (!res.ok || d.error) {
    const err = new Error(d.error?.message || `HTTP ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  return {
    text: d.choices?.[0]?.message?.content || '',
    tokens: d.usage?.total_tokens || 0,
  };
}

export default callOpenAI;
