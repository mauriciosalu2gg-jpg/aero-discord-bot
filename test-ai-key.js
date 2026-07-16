import { dispatchWithFallback } from './services/ai/resilientDispatcher.js';

(async () => {
  try {
    const res = await dispatchWithFallback({
      providers: [
        { name: 'groq', apiKey: 'gsk_fake', models: ['llama-3.1-8b-instant'] }
      ],
      history: [{ role: 'user', content: 'hola' }],
      systemExtra: 'eres un bot'
    });
    console.log("Exito:", res);
  } catch (e) {
    console.error("Fallo esperado con auth:", e);
  }
})();
