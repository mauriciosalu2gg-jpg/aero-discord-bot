import SYSTEM_PROMPT from '../../prompt.js';
export async function callAnthropic(apiKey, model, history, systemExtra = '') {
  if (!apiKey) throw new Error('Anthropic: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 500, system, messages: history }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return { text: d.content?.map(c => c.text || '').join('') || '', tokens: (d.usage?.input_tokens || 0) + (d.usage?.output_tokens || 0) };
}
