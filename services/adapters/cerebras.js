// services/adapters/cerebras.js
// Adaptador propio de Cerebras. NO reutiliza el adaptador de OpenAI:
// Cerebras tiene su propio endpoint y sus propios modelos.
import SYSTEM_PROMPT from '../../prompt.js';
import { chatCompletionsRequest } from '../ai/httpChatClient.js';
import { getMaxTokens, getRepetitionControls } from '../../config/providers.js';

const CEREBRAS_ENDPOINT = 'https://api.cerebras.ai/v1/chat/completions';

export async function callCerebras(apiKey, model, history, systemExtra = '', intent = 'chat') {
  if (!apiKey) throw new Error('Cerebras: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;

  const { text, tokens } = await chatCompletionsRequest({
    url: CEREBRAS_ENDPOINT,
    apiKey,
    model,
    messages: [{ role: 'system', content: system }, ...history],
    maxTokens: getMaxTokens('cerebras', intent),
    extraBody: getRepetitionControls('cerebras'),
  });

  return { text, tokens };
}

export default callCerebras;
