// index.js
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import http from 'node:http';
import config from './config.js';
import secrets from './secrets.js';
import { askAI, startConfigRefresh } from './services/aiManager.js';

import { getMemory, saveMemory } from './core/memory.js';
import { isOwner } from './core/permissions.js';
import { analyzeContext } from './core/contextAnalyzer.js';
import { detectMood } from './core/moodEngine.js';
import { trimHistory, summarizeOld, estimateTokens } from './core/tokenOptimizer.js';
import { splitHumanized } from './core/messageSplitter.js';
import { pickMuletilla, emojiForMood } from './core/personality.js';
import { webSearch, needsWebSearch } from './core/webSearch.js';
import { handleCommand } from './commands/reset.js';
import { handleCommand as handleProviderCommand } from './commands/provider.js';

const PORT = process.env.PORT || 3000;
const startTime = Date.now();
let lastAIResponse = { provider: 'ninguno', model: 'ninguno' };

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
});

client.on('guildCreate', g => config.registerGuild(g));

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.type === 1;
  if (!isMentioned && !isDM) return;

  const guildId = message.guild?.id;
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

  const channelId = message.channelId;

  try {
    await message.channel.sendTyping();

    // 1. Memoria persistente del canal
    const memory = await getMemory(channelId);
    memory.messages = memory.messages || [];
    memory.messages.push({ role: 'user', content, authorName: message.author.username });

    // 2. Contexto (quien habla, mood, si es Lara)
    const context = analyzeContext(memory.messages, message, client.user.id);
    context.isOwnerMessage = isOwner(message.author);
    const mood = detectMood(context);

    // 3. Resumen barato de historial viejo + recorte por tokens, para no
    //    mandar todo el chat completo cada vez (ahorra tokens).
    const { summary, recent } = summarizeOld(memory.messages);
    const recentTokens = recent.reduce((s, h) => s + estimateTokens(h.content), 0);
    const llmHistory = trimHistory(recent, 4000).map(h => ({ role: h.role, content: h.content }));

    // 4. Busqueda web opcional (solo si el mensaje lo amerita y hay API key)
    const webContext = needsWebSearch(content) ? await webSearch(content).catch(() => null) : null;

    // 5. Llamada a la IA con todo el contexto extra
    const response = await askAI(llmHistory, recentTokens, {
      mood,
      isOwner: context.isOwnerMessage,
      memorySummary: summary,
      webContext,
    });

    lastAIResponse = { provider: response.provider, model: response.model };

    // 6. Guardar respuesta en memoria persistente
    memory.messages.push({ role: 'assistant', content: response.text, authorName: client.user.username });
    while (memory.messages.length > 40) memory.messages.shift();
    await saveMemory(channelId, memory);

    if (guildId) config.addTokenUsage(guildId, response.tokens || estimateTokens(response.text));

    // 7. Fragmentar la respuesta como escribe una persona real
    const parts = splitHumanized(response.text);
    for (const part of parts) {
      const chunks = part.match(/[\s\S]{1,1900}/g) || ['...'];
      for (const chunk of chunks) await message.channel.send(chunk);
    }

    // 8. A veces manda un emoji suelto como mensaje aparte (como en la imagen)
    if (Math.random() < 0.12) {
      await message.channel.send(emojiForMood(mood));
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
