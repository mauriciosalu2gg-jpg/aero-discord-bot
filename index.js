// index.js
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import http from 'node:http';
import config from './config.js';
import secrets from './secrets.js';
import { askAI, startConfigRefresh } from './services/aiManager.js';

import { getMemory, saveMemory } from './core/memory.js';
import { isOwner, isSubCreator } from './core/permissions.js';
import { analyzeContext } from './core/contextAnalyzer.js';
import { detectMood } from './core/moodEngine.js';
import { trimHistory, summarizeOld, estimateTokens, buildUltraCompactContext } from './core/tokenOptimizer.js';
import { splitHumanized, delayBetweenParts } from './core/messageSplitter.js';
import { pickMuletilla } from './core/personality.js';
import { webSearch, needsWebSearch } from './core/webSearch.js';
import { computeThinkingDelay, humanizedTyping } from './core/typingDelay.js';
import { getFlags, matchesStopPhrase, matchesResumePhrase, setFlag } from './core/behaviorFlags.js';
import { markActivity, startIdleWatcher } from './core/idleFacts.js';
import { handleCommand } from './commands/reset.js';
import { handleCommand as handleProviderCommand } from './commands/provider.js';
import { handleCommand as handleBehaviorCommand } from './commands/behavior.js';
import { handleApiKeyQuestion } from './commands/apikey.js';
import { getActiveProvider } from './services/ai/providerHealth.js';
import { isBasicModel } from './config/providers.js';

const PORT = process.env.PORT || 3000;
const startTime = Date.now();
let lastAIResponse = { provider: 'ninguno', model: 'ninguno' };

// Trackea canales activos (donde el bot ya hablo al menos una vez) para el
// watcher de inactividad, sin necesidad de guardar esto en DB.
const trackedChannels = new Map(); // channelId -> { guildId }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// Servidor HTTP keepalive para Render + UptimeRobot
http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: client?.isReady?.() ? 'online' : 'connecting',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      tag: client?.user?.tag ?? null,
      guilds: client?.guilds?.cache?.size ?? 0,
      lastProvider: lastAIResponse.provider,
      lastModel: lastAIResponse.model,
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => console.log(`[http] Keepalive en puerto ${PORT}`));

client.once('ready', () => {
  console.log(`[discord] Conectado como ${client.user.tag}`);
  client.guilds.cache.forEach(g => config.registerGuild(g));
  startConfigRefresh(5);
  config.updateBotStatus(client, lastAIResponse);
  setInterval(() => config.updateBotStatus(client, lastAIResponse), 30000);

  // Watcher de inactividad: si un canal lleva 6+ horas sin actividad y no
  // esta "calladito", el bot tira un dato curioso por su cuenta.
  startIdleWatcher(
    () => [...trackedChannels.entries()].map(([channelId, v]) => ({ channelId, guildId: v.guildId })),
    async (channelId) => {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;
      const guild = channel.guild || null;

      const response = await askAI(
        [{ role: 'user', content: 'El chat esta muerto hace horas, tira un dato curioso random para reactivar la charla, corto, con tu propio estilo.' }],
        0,
        { guild, channelName: channel.name, swearingAllowed: getFlags(guild?.id).swearing }
      ).catch(() => null);

      if (response?.text) {
        await channel.send(response.text).catch(() => {});
        markActivity(channelId);
      }
    }
  );
});

client.on('guildCreate', g => config.registerGuild(g));

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.type === 1;

  const guildId = message.guild?.id;
  const channelId = message.channelId;

  // Registramos actividad en CUALQUIER mensaje del canal (no solo cuando
  // le hablan al bot), para que el reloj de inactividad sea real.
  trackedChannels.set(channelId, { guildId });
  markActivity(channelId);

  // Comandos de comportamiento (!calladito, !groserias, etc) y frases
  // naturales de "parar"/"reanudar" del owner, se detectan aunque no
  // mencionen al bot directamente.
  if (isOwner(message.author)) {
    if (matchesStopPhrase(message.content)) {
      setFlag(guildId, 'swearing', false);
      setFlag(guildId, 'factsAutoplay', false);
    } else if (matchesResumePhrase(message.content)) {
      setFlag(guildId, 'swearing', true);
      setFlag(guildId, 'factsAutoplay', true);
    }
  }

  if (!isMentioned && !isDM) return;

  if (guildId) config.registerGuild(message.guild);

  const content = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!content) return;

  // Comandos privilegiados (!reset, !reset all) antes que nada.
  const wasCommand = await handleCommand(message).catch(err => {
    console.error('[command]', err.message);
    return false;
  });
  if (wasCommand) return;

  // Comando de estado del orquestador de IA (!provider / !status), abierto a todos.
  const wasProviderCommand = await handleProviderCommand(message).catch(err => {
    console.error('[command]', err.message);
    return false;
  });
  if (wasProviderCommand) return;

  // Comandos de comportamiento explicitos (!calladito, !groserias on/off, etc).
  const wasBehaviorCommand = await handleBehaviorCommand(message).catch(err => {
    console.error('[command]', err.message);
    return false;
  });
  if (wasBehaviorCommand) return;

  // Si Lara o Gio preguntan directo por api key/modelo/tokens gastados, el
  // bot esta OBLIGADO a contestar con datos reales, sin pasar por la IA.
  const guildTokens = guildId ? await config.getTokenUsage(guildId).catch(() => null) : null;
  const wasApiKeyQuestion = await handleApiKeyQuestion(message, guildTokens).catch(err => {
    console.error('[command]', err.message);
    return false;
  });
  if (wasApiKeyQuestion) return;

  try {
    // 1. Memoria persistente del canal
    const memory = await getMemory(channelId);
    memory.messages = memory.messages || [];
    memory.messages.push({ role: 'user', content, authorName: message.author.username });

    // 2. Contexto (quien habla, mood dinamico con intensidad, si es Lara)
    const context = analyzeContext(memory.messages, message, client.user.id);
    context.isOwnerMessage = isOwner(message.author);
    const moodInfo = detectMood(context);

    // 3. Resumen barato de historial viejo + recorte por tokens, para no
    //    mandar todo el chat completo cada vez (ahorra tokens). Si el
    //    proveedor/modelo actualmente activo es "basico" (ultimo escalon,
    //    ej. flash-lite, 8b-instant, gpt-4o-mini, haiku), usamos un
    //    contexto MEGA resumido para que pueda seguir dando respuestas
    //    coherentes con lo minimo posible mientras los modelos mejores
    //    se recuperan de su cooldown.
    const cachedProvider = getActiveProvider();
    const usingBasicModel = cachedProvider && isBasicModel(cachedProvider.name, cachedProvider.model);

    let summary, recent;
    if (usingBasicModel) {
      const compact = buildUltraCompactContext(memory.messages);
      summary = compact.compactSummary;
      recent = compact.recent;
    } else {
      ({ summary, recent } = summarizeOld(memory.messages));
    }

    const recentTokens = recent.reduce((s, h) => s + estimateTokens(h.content), 0);
    const historyBudget = usingBasicModel ? 1200 : 4000;
    const llmHistory = trimHistory(recent, historyBudget).map(h => ({ role: h.role, content: h.content }));

    // 4. Busqueda web "por voluntad propia": el bot decide si le conviene
    //    saber algo mas antes de responder, nunca lo confiesa en el mensaje.
    const webContext = needsWebSearch(content) ? await webSearch(content).catch(() => null) : null;

    // 5. Flags de comportamiento (groserias / respeto) segun lo que haya
    //    configurado Lara para este servidor.
    const flags = getFlags(guildId);

    // 6. Llamada a la IA con todo el contexto extra
    const response = await askAI(llmHistory, recentTokens, {
      moodInfo,
      isOwner: context.isOwnerMessage,
      isSubCreator: isSubCreator(message.author),
      memorySummary: summary,
      webContext,
      guild: message.guild,
      channelName: message.channel?.name,
      swearingAllowed: flags.swearing,
      respectfulOnly: flags.respectfulOnly,
    });

    lastAIResponse = { provider: response.provider, model: response.model };

    // 7. Guardar respuesta en memoria persistente
    memory.messages.push({ role: 'assistant', content: response.text, authorName: client.user.username });
    while (memory.messages.length > 40) memory.messages.shift();
    await saveMemory(channelId, memory);

    if (guildId) config.addTokenUsage(guildId, response.tokens || estimateTokens(response.text));

    // 8. Delay humano dinamico: NO responde siempre rapido. Depende del
    //    largo del mensaje entrante, del mood (serio/triste tarda mas,
    //    hype/divertido responde mas rapido) y de cuanto va a escribir.
    const thinkingMs = computeThinkingDelay({
      responseText: response.text,
      moodInfo,
      incomingLength: content.length,
    });
    await humanizedTyping(message.channel, thinkingMs);

    // 9. Fragmentar la respuesta como escribe una persona real (a veces
    //    varios mensajes separados en vez de uno solo)
    const parts = splitHumanized(response.text, moodInfo);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const chunks = part.match(/[\s\S]{1,1900}/g) || ['...'];
      for (const chunk of chunks) await message.channel.send(chunk);
      if (i < parts.length - 1) {
        await new Promise(r => setTimeout(r, delayBetweenParts()));
        await message.channel.sendTyping().catch(() => {});
      }
    }

    config.updateBotStatus(client, lastAIResponse);
  } catch (err) {
    console.error('[error]', err.message);
    await message.reply(`${pickMuletilla(channelId)}, tengo problemas con la ia ahora mismo, intenta en un rato`);
  }
});

const token = secrets.getDiscordToken();
if (!token) { console.error('[fatal] DISCORD_TOKEN no configurado.'); process.exit(1); }
client.login(token);
