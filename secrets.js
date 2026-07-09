import "dotenv/config";

const SECRETS = {
  discordToken: process.env.DISCORD_TOKEN || "",

  providers: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      models: {
        bajo: "claude-haiku-4-5-20251001",
        medio: "claude-sonnet-5",
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || "",
        models: {
          bajo: "gpt-oss-120b",
          medio: "gpt-oss-120b",
        },
      },
    groq: {
      apiKey: process.env.GROQ_API_KEY || "",
      models: {
        bajo: "llama-3.1-8b-instant",
        medio: "llama-3.3-70b-versatile",
      },
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
      models: {
        bajo: "gemini-2.0-flash-lite",
        medio: "gemini-2.0-flash",
      },
    },
  },
};

/**
 * Retorna todos los proveedores configurados y disponibles en orden de prioridad.
 * @returns {Array} Lista de proveedores activos con sus credenciales y modelos
 */
function getAvailableProviders() {
  const orden = ["gemini", "openai", "groq", "anthropic"]; // Prioridad del administrador
  const activos = [];
  
  for (const name of orden) {
    const data = SECRETS.providers[name];
    if (data.apiKey && data.apiKey.trim() !== "") {
      activos.push({ name, ...data });
    }
  }
  return activos;
}

/**
 * Retorna el primer proveedor de IA que esté activo (legacy support).
 */
function getActiveProvider() {
  const activos = getAvailableProviders();
  return activos.length > 0 ? activos[0] : null;
}

function getDiscordToken() {
  return SECRETS.discordToken;
}

export default {
  getAvailableProviders,
  getActiveProvider,
  getDiscordToken,
};
