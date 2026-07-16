// services/adapters/mistral.js
// Mistral (La Plateforme) - https://console.mistral.ai
// Tier gratis (Experiment plan) con rate limits bajos, endpoint
// compatible con el formato chat/completions estilo OpenAI.
import SYSTEM_PROMPT from '../../prompt.js';
import { chatCompletionsRequest } from '../ai/httpChatClient.js';
import { getMaxTokens, getRepetitionControls } from '../../config/providers.js';

const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';

export async function callMistral(apiKey, model, history, systemExtra = '', intent = 'chat') {
  if (!apiKey) throw new Error('Mistral: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;

  const { text, tokens } = await chatCompletionsRequest({
    url: MISTRAL_ENDPOINT,
    apiKey,
    model,
    messages: [{ role: 'system', content: system }, ...history],
    maxTokens: getMaxTokens('mistral', intent),
    extraBody: getRepetitionControls('mistral'),
  });

  return { text, tokens };
}

export default callMistral;
