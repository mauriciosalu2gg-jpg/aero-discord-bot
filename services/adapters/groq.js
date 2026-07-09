// services/adapters/groq.js
import SYSTEM_PROMPT from '../../prompt.js';
import { chatCompletionsRequest } from '../ai/httpChatClient.js';

export async function callGroq(apiKey, model, history, systemExtra = '') {
  if (!apiKey) throw new Error('Groq: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;

  const { text, tokens } = await chatCompletionsRequest({
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey,
    model,
    messages: [{ role: 'system', content: system }, ...history],
  });

  return { text, tokens };
}

export default callGroq;
