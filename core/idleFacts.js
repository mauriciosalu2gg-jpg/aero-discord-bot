// core/idleFacts.js
// Si un canal lleva 6+ horas sin actividad, el bot puede tirar un dato
// curioso por su cuenta para reactivar la charla, EXCEPTO si Lara le pidio
// que se quede callado (behaviorFlags.factsAutoplay === false).

import { getFlags } from './behaviorFlags.js';

const MIN_IDLE_MS = 3 * 60 * 60 * 1000;  // 3 horas mínimo
const MAX_IDLE_MS = 5 * 60 * 60 * 1000;  // 5 horas máximo  
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // cada 10 min

// channelId -> { timestamp, threshold }
const lastActivity = new Map();
// channelId -> ya se disparo un dato curioso para este periodo de inactividad
const firedForIdlePeriod = new Set();

export function markActivity(channelId) {
  const threshold = MIN_IDLE_MS + Math.floor(Math.random() * (MAX_IDLE_MS - MIN_IDLE_MS));
  lastActivity.set(channelId, { timestamp: Date.now(), threshold });
  firedForIdlePeriod.delete(channelId);
}

/**
 * Arranca el loop que revisa canales inactivos. `onIdle(channelId)` es un
 * callback async que arma el mensaje (usando la IA) y lo manda al canal.
 */
export function startIdleWatcher(getTrackedChannels, onIdle) {
  setInterval(async () => {
    const now = Date.now();
    const channels = getTrackedChannels();

    for (const { channelId, guildId } of channels) {
      const flags = getFlags(guildId);
      if (!flags.factsAutoplay) continue;

      const last = lastActivity.get(channelId);
      if (!last) continue; // todavia no vimos actividad en este canal
      if (firedForIdlePeriod.has(channelId)) continue;

      if (now - last.timestamp >= last.threshold) {
        firedForIdlePeriod.add(channelId);
        try {
          await onIdle(channelId);
        } catch (err) {
          console.warn('[idleFacts]', err.message);
        }
      }
    }
  }, CHECK_INTERVAL_MS);
}

export default { markActivity, startIdleWatcher };
