// services/adapters/openrouter.js
import SYSTEM_PROMPT from '../../prompt.js';
import { chatCompletionsRequest } from '../ai/httpChatClient.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export async function callOpenRouter(apiKey, model, history, systemExtra = '') {
  if (!apiKey) throw new Error('OpenRouter: sin API Key');
  const system = systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT;

  const { text, tokens } = await chatCompletionsRequest({
    url: OPENROUTER_ENDPOINT,
    apiKey,
    model,
    messages: [{ role: 'system', content: system }, ...history],
    extraHeaders: {
      // Recomendados por OpenRouter para atribución, no afectan la lógica.
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://aero-bot.local',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'Aero Discord Bot',
    },
  });

  return { text, tokens };
}

export default callOpenRouter;
