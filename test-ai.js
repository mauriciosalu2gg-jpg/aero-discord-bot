import askAI from './services/aiManager.js';
(async () => {
  try {
    const res = await askAI([{ role: 'user', content: 'hola' }], 1);
    console.log("Exito:", res.text);
  } catch (e) {
    console.error("Error completo:", e);
  }
})();
