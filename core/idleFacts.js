// core/idleFacts.js
// Si un canal lleva 6+ horas sin actividad, el bot puede tirar un dato
// curioso por su cuenta para reactivar la charla, EXCEPTO si Lara le pidio
// que se quede callado (behaviorFlags.factsAutoplay === false).

import { getFlags } from './behaviorFlags.js';

const IDLE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 horas
const CHECK_INTERVAL_MS = 20 * 60 * 1000; // revisa cada 20 min

// channelId -> timestamp del ultimo mensaje visto (de cualquiera, humano o bot)
const lastActivity = new Map();
// channelId -> ya se disparo un dato curioso para este periodo de inactividad
const firedForIdlePeriod = new Set();

export function markActivity(channelId) {
  lastActivity.set(channelId, Date.now());
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

      if (now - last >= IDLE_THRESHOLD_MS) {
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
