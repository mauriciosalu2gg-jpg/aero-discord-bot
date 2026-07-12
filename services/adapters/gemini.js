// services/adapters/gemini.js
import SYSTEM_PROMPT from '../../prompt.js';
import { getMaxTokens } from '../../config/providers.js';

export async function callGemini(apiKey, model, history, systemExtra = '') {
  if (!apiKey) throw new Error('Gemini: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: history.map(h => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        })),
        generationConfig: { maxOutputTokens: getMaxTokens('gemini') },
      }),
    }
  );

  const d = await res.json();
  if (!res.ok || d.error) {
    const err = new Error(d.error?.message || `HTTP ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  return {
    text: d.candidates?.[0]?.content?.parts?.[0]?.text || '',
    tokens: d.usageMetadata?.totalTokenCount || 0,
  };
}

export default callGemini;
