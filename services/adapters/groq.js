import SYSTEM_PROMPT from '../../prompt.js';
export async function callGroq(apiKey, model, history, systemExtra = '') {
  if (!apiKey) throw new Error('Groq: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: 'system', content: system }, ...history] }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return { text: d.choices?.[0]?.message?.content || '', tokens: d.usage?.total_tokens || 0 };
}
