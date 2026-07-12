// interactions/handlers/forceProviderHandler.js
// /bot ai force <proveedor|auto> -- permite a Lara/Alero forzar que el
// orquestador use un proveedor puntual (para probarlo), ignorando la
// prioridad y el fallback normal, o volver a la rotacion automatica.
// Restringido aca mismo (no en interactionCreate.js) porque el grupo "ai"
// es una ruta abierta para status/providers, que si son de lectura libre.
import { isCreatorOrSubCreator } from '../../core/permissions.js';
import secrets from '../../secrets.js';
import { setForcedProvider, clearForcedProvider, getForcedProvider } from '../../services/ai/providerHealth.js';

const PROVIDER_DISPLAY_NAMES = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  cerebras: 'Cerebras',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
  mistral: 'Mistral',
  cohere: 'Cohere',
};

function displayName(name) {
  return PROVIDER_DISPLAY_NAMES[name] || name;
}

export async function handleForceProviderCommand(interaction) {
  if (!isCreatorOrSubCreator(interaction.user)) {
    await interaction.reply({ content: 'ese comando solo lo pueden usar Lara o Alero', ephemeral: true });
    return true;
  }

  const proveedor = interaction.options.getString('proveedor', true);

  if (proveedor === 'auto') {
    clearForcedProvider();
    await interaction.reply('volvi a la rotacion automatica de proveedores, se elige el mejor disponible segun prioridad y salud');
    return true;
  }

  const configured = secrets.getAvailableProviders();
  const found = configured.find(p => p.name === proveedor);

  if (!found) {
    await interaction.reply({
      content: `${displayName(proveedor)} no tiene API Key configurada en el .env, no lo puedo forzar. Configurados ahora: ${configured.map(p => displayName(p.name)).join(', ') || 'ninguno'}.`,
      ephemeral: true,
    });
    return true;
  }

  setForcedProvider(proveedor);
  await interaction.reply(`listo, a partir de ahora uso SOLO **${displayName(proveedor)}** hasta que hagas \`/bot ai force auto\` o reinicie el bot. Si ${displayName(proveedor)} falla, no voy a caer a otro proveedor automaticamente mientras el forzado siga activo.`);
  return true;
}

export default { handleForceProviderCommand };
