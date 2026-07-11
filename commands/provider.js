// commands/provider.js
// DEPRECADO: este archivo nunca estuvo importado/cableado en index.js, asi
// que el comando de texto !provider jamas funciono en la practica. La
// funcionalidad equivalente (y mejorada) ahora vive como slash command
// real en interactions/handlers/providerStatusHandler.js (/provider).
// Se deja este archivo sin borrar por si hay referencias externas, pero
// no se debe volver a cablear: usar el slash command en su lugar.
//
// !provider / !status  -> muestra el estado completo del orquestador de IA:
// proveedor activo, modelo, salud de cada proveedor, cooldown restante y
// tiempo de respuesta promedio. Disponible para cualquiera (solo lectura).

import secrets from '../secrets.js';
import { getActiveProvider, getAllSnapshots } from '../services/ai/providerHealth.js';

const STATUS_EMOJI = {
  Healthy: '🟢',
  Slow: '🟡',
  'Rate Limited': '🟠',
  'Quota Exceeded': '🔴',
  Offline: '⚫',
};

function fmtMs(ms) {
  if (!ms || ms <= 0) return '—';
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 1000)}s`;
}

function fmtWhen(ts) {
  if (!ts) return 'nunca';
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return `hace ${diffSec}s`;
  if (diffSec < 3600) return `hace ${Math.round(diffSec / 60)} min`;
  return `hace ${Math.round(diffSec / 3600)}h`;
}

export async function handleCommand(message) {
  const content = message.content.trim().toLowerCase();
  const isStatusCmd = content === '!provider' || content === '!providers' || content === '!status';
  if (!isStatusCmd) return false;

  const providerNames = secrets.PROVIDER_PRIORITY;
  const snapshots = getAllSnapshots(providerNames);
  const active = getActiveProvider();

  const lines = [];
  lines.push('**🧠 Estado del orquestador de IA**');
  lines.push(
    active
      ? `**Proveedor activo:** ${active.name}  |  **Modelo:** ${active.model || '—'}`
      : '**Proveedor activo:** ninguno cacheado (se elegirá en el próximo mensaje)'
  );
  lines.push('');

  for (const snap of snapshots) {
    const emoji = STATUS_EMOJI[snap.status] || '⚪';
    const cooldown = snap.onCooldown ? `⏳ cooldown ${fmtMs(snap.cooldownRemainingMs)}` : 'listo';
    const avgLatency = snap.averageLatencyMs ? `${snap.averageLatencyMs} ms` : '—';

    lines.push(
      `${emoji} **${snap.name}** — ${snap.status} (${cooldown})\n` +
      `   ↳ usos: ${snap.timesUsed} | errores: ${snap.errors} | latencia prom: ${avgLatency}\n` +
      `   ↳ último éxito: ${fmtWhen(snap.lastSuccessAt)} | último fallo: ${fmtWhen(snap.lastErrorAt)}` +
      (snap.lastError ? ` (${snap.lastError})` : '')
    );
  }

  if (!snapshots.length) {
    lines.push('_No hay proveedores configurados con API Key._');
  }

  await message.reply(lines.join('\n'));
  return true;
}

export default { handleCommand };
