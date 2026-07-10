// core/typingDelay.js
// Calcula cuanto "tarda en escribir" el bot antes de responder, de forma
// dinamica segun el peso del contexto: un mensaje corto y liviano se
// responde rapido, uno serio/triste/largo tarda mas, como si lo estuviera
// pensando de verdad. Nunca es fijo, siempre hay variacion aleatoria.

/**
 * @param {object} params
 * @param {string} params.responseText - texto que el bot va a mandar
 * @param {{mood:string, intensity:number, serious?:boolean, crisis?:boolean}} params.moodInfo
 * @param {number} params.incomingLength - largo del mensaje del usuario
 * @returns {number} milisegundos a esperar antes de mandar el "typing" y la respuesta
 */
export function computeThinkingDelay({ responseText = '', moodInfo = {}, incomingLength = 0 } = {}) {
  const { mood, intensity = 1, serious = false, crisis = false } = moodInfo;

  // Base: mensajes cortos y triviales responden casi al toque.
  let baseMs = 400 + Math.random() * 900;

  // Mensajes largos de respuesta = mas "tiempo de tipeo" simulado.
  const lengthFactor = Math.min(responseText.length, 600) * 12;
  baseMs += lengthFactor;

  // Si el mensaje entrante es largo/denso, el bot "lee mas" antes de responder.
  if (incomingLength > 200) baseMs += 800 + Math.random() * 1200;

  // Temas serios, tristes o de crisis: pausa reflexiva mas larga, como
  // si lo estuviera pensando en vez de tirar la primera respuesta.
  if (crisis) baseMs += 2500 + Math.random() * 2000;
  else if (serious) baseMs += 1800 + Math.random() * 1500;
  else if (mood === 'triste') baseMs += 1200 + Math.random() * 1200;

  // Moods de alta energia (hype, divertido, coqueto intenso) responden mas rapido.
  if ((mood === 'hype' || mood === 'divertido') && intensity >= 2) {
    baseMs *= 0.6;
  }

  // Variacion aleatoria extra para que nunca sea predecible/robotico.
  const jitter = (Math.random() - 0.5) * 600;
  baseMs += jitter;

  // Limites razonables: nunca instantaneo, nunca eterno.
  return Math.max(350, Math.min(baseMs, 9000));
}

/**
 * Espera el delay y mantiene el indicador de "escribiendo..." activo en
 * Discord durante ese tiempo (Discord solo lo muestra ~10s por llamada,
 * asi que lo refrescamos si el delay es largo).
 */
export async function humanizedTyping(channel, delayMs) {
  const start = Date.now();
  await channel.sendTyping().catch(() => {});
  while (Date.now() - start < delayMs) {
    const remaining = delayMs - (Date.now() - start);
    const step = Math.min(remaining, 8000);
    await new Promise(r => setTimeout(r, step));
    if (Date.now() - start < delayMs) {
      await channel.sendTyping().catch(() => {});
    }
  }
}

export default { computeThinkingDelay, humanizedTyping };
