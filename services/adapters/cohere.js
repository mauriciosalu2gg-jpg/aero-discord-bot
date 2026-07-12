// services/adapters/cohere.js
// Cohere - https://dashboard.cohere.com/api-keys
// Las "trial keys" de Cohere son gratis (con rate limit mensual) y su
// endpoint de compatibilidad habla el mismo formato chat/completions
// que OpenAI, asi que reusamos el mismo cliente HTTP generico.
import SYSTEM_PROMPT from '../../prompt.js';
import { chatCompletionsRequest } from '../ai/httpChatClient.js';
import { getMaxTokens, getRepetitionControls } from '../../config/providers.js';

const COHERE_ENDPOINT = 'https://api.cohere.ai/compatibility/v1/chat/completions';

export async function callCohere(apiKey, model, history, systemExtra = '') {
  if (!apiKey) throw new Error('Cohere: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;

  const { text, tokens } = await chatCompletionsRequest({
    url: COHERE_ENDPOINT,
    apiKey,
    model,
    messages: [{ role: 'system', content: system }, ...history],
    maxTokens: getMaxTokens('cohere'),
    extraBody: getRepetitionControls('cohere'),
  });

  return { text, tokens };
}

export default callCohere;
