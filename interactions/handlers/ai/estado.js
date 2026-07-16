import { getActiveProvider, getForcedProvider, getAllSnapshots } from '../../../services/ai/providerHealth.js';
import secrets from '../../../secrets.js';
import { getUserMemoryConfig } from '../../../core/memory/config.js';

const PROVIDER_DISPLAY_NAMES = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  cerebras: 'Cerebras',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
  ollama: 'Ollama (local)',
  lmstudio: 'LM Studio (local)',
};

function displayName(name) {
  return PROVIDER_DISPLAY_NAMES[name] || name;
}

export async function handleEstado(interaction) {
  const active = getActiveProvider();
  const forced = getForcedProvider();
  const providerNames = secrets.PROVIDER_PRIORITY;
  const snapshots = getAllSnapshots(providerNames);

  const modo = forced ? 'Manual (Forzado)' : 'Automático';
  const estado = '🟢 Online';

  let proveedorActivo = 'Iniciando / Ninguno';
  let modeloActivo = 'N/A';
  let tiempoRespuesta = 'N/A';

  if (active) {
    proveedorActivo = displayName(active.name);
    modeloActivo = active.model;
    const snap = snapshots.find(s => s.name === active.name);
    if (snap && snap.averageLatencyMs) {
      tiempoRespuesta = `${snap.averageLatencyMs} ms`;
    }
  }

  const healthy = snapshots
    .filter(s => s.status === 'Healthy' && (!active || s.name !== active.name))
    .map(s => displayName(s.name));

  const proveedorRespaldo = healthy.length > 0 ? healthy[0] : 'Ninguno';

  const userConfig = await getUserMemoryConfig(interaction.user.id);
  const memoriaModo = userConfig.mode === 'global' ? 'Global' : 'Local';

  const embed = {
    color: 0x2ecc71,
    title: '📊 Estado de la Inteligencia Artificial',
    fields: [
      { name: 'Proveedor Activo', value: proveedorActivo, inline: true },
      { name: 'Modelo', value: modeloActivo, inline: true },
      { name: 'Modo', value: modo, inline: true },
      { name: 'Tiempo de respuesta', value: tiempoRespuesta, inline: true },
      { name: 'Memoria', value: memoriaModo, inline: true },
      { name: 'Estado', value: estado, inline: true },
      { name: 'Proveedor de respaldo', value: proveedorRespaldo, inline: false },
    ],
    footer: { text: 'Sistema de Diagnóstico Integrado' }
  };

  await interaction.followUp({ embeds: [embed] });
}
