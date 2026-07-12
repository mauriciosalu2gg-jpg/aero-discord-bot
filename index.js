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
import { getFlags, matchesStopPhrase, matchesResumePhrase, setFlag, hydrateFlags } from './core/behaviorFlags.js';
import { markActivity, startIdleWatcher } from './core/idleFacts.js';
import { isModerationActive, messageViolatesRespect, registerViolationAndGetSanction, hydrateModerationFlags, hydrateStrikes } from './core/moderationEngine.js';
import { handleInteraction } from './interactions/interactionCreate.js';
import { isPendingFunadorAnswer } from './core/funadorSession.js';
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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

function isNaturalPrompt(text) {
  const clean = (text || '').trim();
  if (!clean) return false;
  if (/^[/!]/.test(clean)) return false;
  if (/^[a-z0-9_-]{1,24}$/i.test(clean) && !/\s/.test(clean) && clean.length <= 4) return false;
  return true;
}

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

client.once('ready', async () => {
  console.log(`[discord] Conectado como ${client.user.tag}`);
  client.guilds.cache.forEach(g => config.registerGuild(g));
  startConfigRefresh(5);
  config.updateBotStatus(client, lastAIResponse);
  setInterval(() => config.updateBotStatus(client, lastAIResponse), 30000);

  // Precarga desde Firestore los flags de comportamiento y el estado de
  // moderacion/strikes de cada servidor, para no perder configuracion en
  // cada reinicio/redeploy de Render.
  await hydrateFlags().catch(err => console.error('[hydrate/flags]', err.message));
  await hydrateModerationFlags().catch(err => console.error('[hydrate/moderation]', err.message));
  await hydrateStrikes().catch(err => console.error('[hydrate/strikes]', err.message));

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

// ── Slash command unico: /bot <grupo> <subcomando> ──
client.on('interactionCreate', handleInteraction);

// ── Moderacion automatica: corre ANTES que cualquier otra logica, para
//    cualquier mensaje humano, este o no el bot mencionado. ──
async function runAutoModeration(message) {
  const guildId = message.guild?.id;
  if (!guildId || !isModerationActive(guildId)) return false;

  // Un insulto "va dirigido a alguien" si menciona a otro usuario humano,
  // o si es una respuesta directa (reply) a otro mensaje -- ambas son
  // señales fuertes de que no es una grosería general al aire.
  const mentionsSomeoneElse = message.mentions.users.some(u => !u.bot && u.id !== message.author.id);
  const isReplyToSomeone = !!message.reference;
  const hasTargetMention = mentionsSomeoneElse || isReplyToSomeone;

  if (!messageViolatesRespect(message.content, hasTargetMention)) return false;

  const sanction = registerViolationAndGetSanction(guildId, message.author.id);
  const member = message.member;

  try {
    if (message.deletable) {
      await message.delete().catch(() => {});
    }
    switch (sanction.kind) {
      case 'warn':
        await message.channel.send({
          content: `⚠️ <@${message.author.id}> baja un cambio. Eso cuenta como falta ${sanction.strikeNumber}.`,
          allowedMentions: { users: [message.author.id] },
        });
        break;
      case 'timeout':
        if (member?.moderatable) {
          await member.timeout(sanction.durationMs, 'Moderacion automatica: falta de respeto repetida');
        }
        await message.channel.send({
          content: `🔇 <@${message.author.id}> timeout de ${sanction.label}. Vuelve a hablar cuando termine.\n⏳ Tiempo estimado: <t:${Math.floor((Date.now() + sanction.durationMs) / 1000)}:R> (Finaliza: <t:${Math.floor((Date.now() + sanction.durationMs) / 1000)}:F>)`,
          allowedMentions: { users: [message.author.id] },
        });
        break;
      case 'kick':
        if (member?.kickable) {
          await member.kick('Moderacion automatica: falta de respeto repetida');
        }
        await message.channel.send({
          content: `👢 <@${message.author.id}> fue expulsado por reincidir.`,
          allowedMentions: { users: [message.author.id] },
        });
        break;
      case 'ban':
        if (member?.bannable) {
          await member.ban({ reason: 'Moderacion automatica: falta de respeto repetida (limite alcanzado)' });
        }
        await message.channel.send({
          content: `🔨 <@${message.author.id}> fue baneado por reincidir despues de varios avisos.`,
          allowedMentions: { users: [message.author.id] },
        });
        break;
    }
  } catch (err) {
    console.error('[moderation] Error aplicando sancion:', err.message);
  }

  return true;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const isMentioned = message.mentions.has(client.user);
  const isReplyToBot = message.reference?.messageId
    ? await message.fetchReference().then(ref => ref.author?.id === client.user.id).catch(() => false)
    : false;
  const isDM = message.channel.type === 1;

  const guildId = message.guild?.id;
  const channelId = message.channelId;

  // Registramos actividad en CUALQUIER mensaje del canal (no solo cuando
  // le hablan al bot), para que el reloj de inactividad sea real.
  trackedChannels.set(channelId, { guildId });
  markActivity(channelId);

  // Si este mensaje es la respuesta que un /funador en curso esta
  // esperando de esta persona (consentimiento, abogados, interrogatorio,
  // etc), NO debe pasar a moderacion ni a la IA normal: funadorSession.js
  // ya lo esta escuchando con su propio awaitMessages/awaitReactions.
  // Sin este corte, el boton "Responder" de Discord (que menciona
  // implicitamente al bot) disparaba ADEMAS una respuesta de charla
  // normal, pisando el flujo del juicio.
  if (isPendingFunadorAnswer(channelId, message.author.id)) return;

  // Moderacion automatica: corre siempre que este activa, sin importar si
  // le hablan al bot o no.
  const wasSanctioned = await runAutoModeration(message).catch(err => {
    console.error('[moderation]', err.message);
    return false;
  });
  if (wasSanctioned) return;

  // Comandos de comportamiento (!calladito, !groserias, etc) y frases
  // naturales de "parar"/"reanudar" del owner, se detectan aunque no
  // mencionen al bot directamente.
  if (isOwner(message.author)) {
    if (matchesStopPhrase(message.content)) {
      await setFlag(guildId, 'swearing', false);
      await setFlag(guildId, 'factsAutoplay', false);
    } else if (matchesResumePhrase(message.content)) {
      await setFlag(guildId, 'swearing', true);
      await setFlag(guildId, 'factsAutoplay', true);
    }
  }

  const flags = getFlags(guildId);

  // ambientMode/forceTalk: el bot puede responder sin que lo mencionen.
  // forceTalk responde a TODO; ambientMode solo mete comentarios random
  // via el watcher de inactividad ya existente (no cambia este flujo).
  const shouldRespond = isMentioned || isReplyToBot || isDM || flags.forceTalk;
  if (!shouldRespond) return;

  if (guildId) config.registerGuild(message.guild);

  const content = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!content) return;
  if (!isDM && !flags.forceTalk && !isNaturalPrompt(content)) return;

  // Si Lara o Gio preguntan directo por api key/modelo/tokens gastados
  // en texto plano (compatibilidad con el viejo estilo, ademas del slash
  // command /ai status), el bot esta OBLIGADO a contestar con datos
  // reales, sin pasar por la IA.
  const guildTokens = guildId ? await config.getTokenUsage(guildId).catch(() => null) : null;
  const wasApiKeyQuestion = await handleApiKeyQuestion(message, guildTokens).catch(err => {
    console.error('[command]', err.message);
    return false;
  });
  if (wasApiKeyQuestion) return;

  try {
    // 1. Memoria persistente del canal (separada por servidor, en Firestore)
    const memory = await getMemory(channelId, guildId);
    memory.messages = memory.messages || [];
    memory.messages.push({ role: 'user', content, authorName: message.author.username });

    // 2. Contexto (quien habla, mood dinamico con intensidad, si es Lara)
    const context = analyzeContext(memory.messages, message, client.user.id);
    context.isOwnerMessage = isOwner(message.author);
    const moodInfo = detectMood(context);

    // El mood "funador" (tono acusador con formato Discord) solo se usa si
    // el server activo lo activo explicitamente con /bot funador activate.
    // Es reactivo unicamente: se dispara por lo que la persona ACABA de
    // escribir en este mensaje, nunca por vigilancia de mensajes previos
    // ni por iniciativa propia del bot.
    if (moodInfo.mood === 'funador' && !flags.funador) {
      moodInfo.mood = 'dramatico';
    }

    // 3. Resumen barato de historial viejo + recorte por tokens
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

    // 4. Busqueda web "por voluntad propia"
    const webContext = needsWebSearch(content) ? await webSearch(content).catch(() => null) : null;

    // 5. Llamada a la IA con todo el contexto extra
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
      securityMode: flags.securityMode,
    });

    lastAIResponse = { provider: response.provider, model: response.model };

    // 6. Guardar respuesta en memoria persistente
    memory.messages.push({ role: 'assistant', content: response.text, authorName: client.user.username });
    while (memory.messages.length > 40) memory.messages.shift();
    await saveMemory(channelId, memory, guildId);

    if (guildId) config.addTokenUsage(guildId, response.tokens || estimateTokens(response.text));

    // 7. Delay humano dinamico
    const thinkingMs = computeThinkingDelay({
      responseText: response.text,
      moodInfo,
      incomingLength: content.length,
    });
    await humanizedTyping(message.channel, thinkingMs);

    // 8. Fragmentar la respuesta como escribe una persona real
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
