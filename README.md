# Aero Discord Bot

Bot de Discord con IA multi-proveedor, personalidad humana y panel de control web.

## Proveedores de IA soportados

| Proveedor | Gratis | Notas |
|-----------|--------|-------|
| **Groq** | ✅ | Recomendado, muy rápido |
| **Gemini** | ✅ | Tier gratuito de Google |
| **OpenAI** | ❌ | Requiere créditos |
| **Anthropic** | ❌ | Requiere créditos |
| **Ollama** | ✅ | Local, sin internet |
| **LM Studio** | ✅ | Local, sin internet |

## Deploy en Render

1. Conecta este repo en [render.com](https://render.com)
2. **Start Command**: `node index.js`
3. Agrega las variables del `.env.example` en Render → Environment Variables
4. En [UptimeRobot.com](https://uptimerobot.com) → New Monitor → HTTP → tu URL de Render → cada 5 min

## Variables mínimas requeridas

```
DISCORD_TOKEN=tu_token
GROQ_API_KEY=gsk_tu_key  # o cualquier otra API Key
```

## Rutas HTTP

| Ruta | Descripción |
|------|-------------|
| `GET /` | Health check para UptimeRobot (responde OK) |
| `GET /status` | Estado del bot en JSON |

## Estructura

```
index.js              # Entrada + servidor HTTP keepalive
config.js             # Sincronización Firestore
secrets.js            # Variables de entorno
prompt.js             # Personalidad del bot
services/
  aiManager.js        # Gestor IA con failover
  adapters/           # Un archivo por proveedor
database/
  firebase.js         # Firebase Admin init
```
# Memory Engine v2 - Dynamic Reasoning v1.0
