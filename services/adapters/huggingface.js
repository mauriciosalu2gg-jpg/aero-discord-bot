// services/adapters/huggingface.js
// HuggingFace se usa como último respaldo. Usa el router de inferencia
// compatible con el esquema OpenAI (router.huggingface.co).
import SYSTEM_PROMPT from '../../prompt.js';
import { chatCompletionsRequest } from '../ai/httpChatClient.js';

const HUGGINGFACE_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

export async function callHuggingFace(apiKey, model, history, systemExtra = '') {
  if (!apiKey) throw new Error('HuggingFace: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;

  const { text, tokens } = await chatCompletionsRequest({
    url: HUGGINGFACE_ENDPOINT,
    apiKey,
    model,
    messages: [{ role: 'system', content: system }, ...history],
  });

  return { text, tokens };
}

export default callHuggingFace;
