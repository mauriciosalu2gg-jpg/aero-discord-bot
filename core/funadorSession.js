// core/funadorSession.js
// "Juicio" en broma, tipo juego de mesa entre amigos, narrado en muchas
// etapas reales (nunca un bloque de texto de una sola vez). NUNCA arranca
// sin permiso: primero le pregunta al acusado si quiere jugar, despues
// invita (sin presionar) a que otros se sumen como "testigos" si quieren,
// y solo si el acusado dijo que si se sigue.
//
// Etapas: consentimiento -> ambos bandos pueden tagear "abogados" (20s c/u,
// tope 3 por bando) -> ventana de testigos (45s, tope 4 por bando, votable
// para saltar, clasificados dinamicamente por la IA segun el historial) ->
// apertura + fiscalia (con contexto de los ultimos 10 min de chat) ->
// interrogatorio real al acusado (3 rondas) -> interrogatorio a testigos
// (3 rondas c/u) -> interrogatorio a abogados de ambos bandos (3 rondas
// c/u, interrumpible con /objecion) -> testimonio final del acusador ->
// alegatos finales de ambos bandos -> contra-argumento -> deliberacion ->
// veredicto, donde la IA clasifica dinamicamente si cada participante jugo
// a favor o en contra del acusado (segun lo que dijeron, no segun su "rol")
// y decide un ganador. Nada de esto es real: no hay sanciones, no se guarda
// evidencia aparte, y todo usa solo el historial visible del canal + lo
// dicho en la sesion.
//
// IMPORTANTE (anti doble-respuesta): mientras el bot esta esperando la
// respuesta de alguien dentro del juicio, esa persona queda marcada como
// "pendiente" en este canal. index.js chequea esa marca ANTES de mandar el
// mensaje a la IA normal, asi si alguien contesta con el boton "Responder"
// de Discord (que mencion implicitamente al bot) su respuesta se usa SOLO
// para el juicio y no dispara ademas una respuesta de charla normal.
import { askAI } from '../services/aiManager.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { getMemory } from './memory/index.js';
import { humanizedTyping } from './typingDelay.js';

const CONSENT_TIMEOUT_MS = 2 * 60 * 1000;   // 2 min para que el acusado consienta
const LAWYERS_WINDOW_MS = 20 * 1000;        // 20s para etiquetar abogados (ambos bandos)
const WITNESS_WINDOW_MS = 45 * 1000;        // 45s abiertos para sumarse como testigo
const ANSWER_TIMEOUT_MS = 75 * 1000;        // 75s por cada respuesta esperada en una ronda
const MAX_LAWYERS_PER_SIDE = 3;             // tope de abogados, por bando
const MAX_WITNESSES_PER_SIDE = 4;           // tope de testigos, por bando
const HISTORY_LOOKBACK_MS = 10 * 60 * 1000; // 10 min de historial antes del juicio para contexto

const SECTION_DELIM = '|||SECCION|||';
// Version recortada de las reglas de estilo (mismo contenido funcional,
// menos texto de relleno). Se repite en CASI todos los prompts del juicio,
// asi que cada palabra que se saca aca se multiplica por ~12-15 llamadas
// a la IA en una sesion tipica -- es el ahorro de tokens con mas impacto
// real sin cambiar el comportamiento.
const STYLE_RULES =
  'Reglas: (1) para nombrar gente usa SOLO las menciones <> dadas, nunca inventes nombres; ' +
  '(2) max 3 lineas; (3) comedia amistosa tipo reality, nunca insultos reales; ' +
  '(4) no inventes acusaciones fuera de lo dado.';

// Tope de caracteres para el bloque de historial/contexto que se manda en
// cada prompt (fiscalia, contra-argumento, veredicto, etc). Recortar esto
// es el segundo mayor ahorro: el historial se repite varias veces a lo
// largo de la sesion.
const HISTORY_CHAR_LIMIT = 1400;

function formatDiscordTime(ms, label = '⏳ Tiempo estimado') {
  const unix = Math.floor((Date.now() + ms) / 1000);
  return `${label}: <t:${unix}:R>`;
}

function formatUserLabel(user, mention) {
  const displayName = user?.globalName || user?.displayName || user?.username;
  return displayName ? `${mention} (${displayName})` : mention;
}

// Recorta un bloque de texto (historial o testimonios ya unidos) a un
// tope de caracteres, cortando por mensaje/entrada entera cuando se puede
// en vez de a la mitad de una linea, para no mandar contexto trunco feo
// (y ahorra tokens de entrada sin perder la sustancia del historial).
function capText(text, limit = HISTORY_CHAR_LIMIT) {
  if (!text || text.length <= limit) return text;
  const cut = text.slice(-limit); // nos quedamos con lo MAS RECIENTE, que es lo mas relevante
  const firstBreak = cut.indexOf('\n');
  return firstBreak > 0 && firstBreak < 200 ? cut.slice(firstBreak + 1) : cut;
}

// channelId -> true mientras hay una sesion en curso (evita solapar bits)
const activeSessions = new Set();

// channelId -> { targetId, initiatorId, defenseLawyerIds:Set, accuserLawyerIds:Set }
// Se llena en cuanto se conocen los abogados de cada bando, y se borra al
// terminar la sesion. Lo usa /objecion para validar quien puede objetar y
// contra que bando, sin tener que ser Lara/Alero.
const sessionRoles = new Map();

// channelId -> Array de objeciones pendientes de aplicar en la proxima
// narracion de la IA (se consumen y limpian solas despues de usarse).
const pendingObjections = new Map();

export function getSessionRoles(channelId) {
  return sessionRoles.get(channelId) || null;
}

// Valida y registra una objecion. Reglas:
// - Solo se puede usar mientras hay una sesion activa en ESE canal.
// - Solo la puede usar un abogado (de cualquiera de los dos bandos)
//   registrado en esa sesion -- no el acusado, no el acusador, no testigos,
//   no gente random del canal.
// - No se puede "objetar" a tu propio bando (un abogado defensor no puede
//   objetar a otro abogado defensor, por ejemplo), solo al bando contrario
//   o a un testigo/testimonio neutral.
// - Maximo 1 objecion "activa" en cola por canal a la vez, para que no se
//   spammee /objecion en cadena y trabe la narracion.
// Devuelve { ok: true } o { ok: false, reason: string } para que el handler
// del comando responda apropiadamente.
export function registerObjection(channelId, userId, motivo) {
  const roles = sessionRoles.get(channelId);
  if (!roles) return { ok: false, reason: 'no hay ningun juicio activo en este canal ahora mismo.' };

  const isDefense = roles.defenseLawyerIds.has(userId);
  const isAccuserSide = roles.accuserLawyerIds.has(userId);
  if (!isDefense && !isAccuserSide) {
    return { ok: false, reason: 'solo los abogados registrados en este juicio (de cualquiera de los dos bandos) pueden usar /objecion.' };
  }

  const queue = pendingObjections.get(channelId) || [];
  if (queue.length >= 1) {
    return { ok: false, reason: 'ya hay una objecion esperando a ser resuelta, aguantate a que se procese esa primero.' };
  }

  queue.push({ userId, side: isDefense ? 'defensa' : 'acusacion', motivo: motivo?.trim() || '(sin motivo especificado)' });
  pendingObjections.set(channelId, queue);
  return { ok: true, side: isDefense ? 'defensa' : 'acusacion' };
}

// Saca (y limpia) las objeciones pendientes de un canal, para que la
// narracion de la IA las tenga en cuenta una sola vez.
function consumeObjections(channelId) {
  const queue = pendingObjections.get(channelId) || [];
  pendingObjections.delete(channelId);
  return queue;
}

// channelId -> Set(userId) de personas cuya PROXIMA respuesta en el canal
// es para el juicio, no para charla normal con la IA. index.js la consulta.
const pendingAnswers = new Map();

export function isPendingFunadorAnswer(channelId, userId) {
  return pendingAnswers.get(channelId)?.has(userId) || false;
}

function markPending(channelId, userId) {
  if (!pendingAnswers.has(channelId)) pendingAnswers.set(channelId, new Set());
  pendingAnswers.get(channelId).add(userId);
}

function unmarkPending(channelId, userId) {
  pendingAnswers.get(channelId)?.delete(userId);
}

function buildConsentPrompt(initiatorMention, targetMention, razon = null) {
  return (
    `⚖️ **Se propone un juicio de mentira.**\n` +
    `${targetMention}, ${initiatorMention} quiere armarte este juego en joda.\n` +
    `${razon ? `**Tema:** ${razon}\n` : ''}` +
    `No es en serio: es solo un bit divertido con lo que ya se hablo en el canal.\n\n` +
    `Si queres jugar, cliquea en **Acepto**.\n` +
    `Si no queres, cliquea en **Paso**.`
  );
}

function buildButtons(buttons) {
  return [
    new ActionRowBuilder().addComponents(
      buttons.map(btn =>
        new ButtonBuilder()
          .setCustomId(btn.id)
          .setLabel(btn.label)
          .setStyle(btn.style)
      )
    ),
  ];
}

async function pause(channel, ms = 1500) {
  await humanizedTyping(channel, Math.min(ms, 8000)).catch(() => {});
}

// Manda un mensaje narrativo (fiscalia, apertura, contra-argumento, etc)
// SIN pingear de nuevo a nadie, aunque el texto contenga <@id>. Discord
// solo respeta allowedMentions si se lo pasamos explicitamente; sin esto,
// cada mensaje narrado repetia el ping de todos los mencionados una y otra
// vez. Los mensajes que SI necesitan avisar de verdad (llamar a alguien a
// declarar, pedirle una respuesta) siguen usando channel.send normal.
async function sendNarration(channel, text) {
  return channel.send({ content: text, allowedMentions: { parse: [] } });
}

async function askConsentWithButtons(channel, targetUser, initiatorMention, targetMention, razon) {
  const consentMsg = await channel.send({
    content: buildConsentPrompt(initiatorMention, targetMention, razon),
    components: buildButtons([
      { id: `funador-consent-yes:${targetUser.id}`, label: 'Acepto', style: ButtonStyle.Success },
      { id: `funador-consent-no:${targetUser.id}`, label: 'Paso', style: ButtonStyle.Secondary },
    ]),
  });

  const click = await consentMsg.awaitMessageComponent({
    componentType: ComponentType.Button,
    time: CONSENT_TIMEOUT_MS,
    filter: i => i.user.id === targetUser.id && i.customId.endsWith(`:${targetUser.id}`),
  }).catch(() => null);

  if (!click) {
    await consentMsg.edit({ components: [] }).catch(() => {});
    return false;
  }

  const accepted = click.customId.startsWith('funador-consent-yes:');
  await click.update({ components: [] }).catch(() => {});
  return accepted;
}

const EXTRA_TIME_PHRASES = [
  'dame tiempo', 'dame chance', 'espera', 'un momento', 'un segundo',
  'ya voy', 'estoy escribiendo', 'terminando de escribir', 'un toque',
  'aguanta', 'aguante', 'dame un rato', 'necesito mas tiempo', 'necesito más tiempo',
  'ando escribiendo', 'ando terminando',
];

function asksForMoreTime(content) {
  if (!content) return false;
  const lower = content.toLowerCase();
  return EXTRA_TIME_PHRASES.some(p => lower.includes(p));
}

// Fetcha los ultimos N minutos de mensajes del canal (sin bots, sin comandos,
// solo mensajes reales de usuarios) para armar un contexto de lo que paso
// reciente antes de que arranque el juicio. Util para que la IA sepa que
// acusar/defender, en vez de improvisar algo generico.
async function fetchRecentChannelHistory(channel, lookbackMs = HISTORY_LOOKBACK_MS) {
  try {
    const now = Date.now();
    const cutoff = now - lookbackMs;
    const messages = [];

    let lastId = null;
    while (true) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(lastId ? { before: lastId } : {}),
      }).catch(() => null);

      if (!batch || batch.size === 0) break;

      for (const msg of batch.values()) {
        if (msg.createdTimestamp < cutoff) {
          return messages;
        }
        if (msg.author.bot) continue;
        if (msg.content.startsWith('/') || msg.content.startsWith('!')) continue;
        messages.push({
          author: msg.author.username,
          content: msg.content.trim(),
          timestamp: msg.createdTimestamp,
        });
      }

      lastId = batch.last().id;
    }

    return messages.reverse();
  } catch (err) {
    console.error('[funadorSession/fetchRecentChannelHistory]', err.message);
    return [];
  }
}

// Manda un mensaje/pregunta y espera UNA respuesta real de esa persona en
// el canal (o null si no contesto a tiempo). Marca/desmarca "pendiente"
// para que index.js no la mande tambien a la IA normal.
//
// Si la persona responde pidiendo mas tiempo ("dame chance", "un momento",
// etc) en vez de dar su respuesta real, el bot le da UNA extension de
// tiempo (mismo largo que el timeout original) en lugar de cerrarle la
// ronda como si no hubiera contestado nada.
async function askAndWait(channel, userId, question, timeMs = ANSWER_TIMEOUT_MS, allowExtension = true) {
  await pause(channel, 1300);
  await channel.send(`${question}\n${formatDiscordTime(timeMs)}`);
  markPending(channel.id, userId);
  try {
    const collected = await channel
      .awaitMessages({ filter: m => m.author.id === userId, max: 1, time: timeMs, errors: ['time'] })
      .catch(() => null);
    const text = collected?.first()?.content?.trim() || null;

    if (text && asksForMoreTime(text) && allowExtension) {
      await pause(channel, 900);
      await channel.send(formatDiscordTime(timeMs, '⏳ Tiempo extra'));
      unmarkPending(channel.id, userId);
      return askAndWait(channel, userId, `${question} (tiempo extendido)`, timeMs, false);
    }

    return text;
  } finally {
    unmarkPending(channel.id, userId);
  }
}

// Interrogatorio de 1 a 3 rondas reutilizable para acusado/testigos/abogados.
// Antes de cada ronda, si hay una /objecion pendiente en el canal, la
// consume, la narra como interrupcion y le da a la persona interrogada
// unos segundos extra antes de seguir (asi la objecion se "siente" en
// vivo, no queda flotando sin efecto).
//
// Ahora son hasta 3 rondas (antes 2) para que el interrogatorio se sienta
// mas extendido: pregunta inicial -> repregunta -> repregunta final mas
// picante, cada una generada en base a lo que la persona ya respondio
// (nunca la misma pregunta generica repetida).
async function interrogate(channel, guild, personId, personMention, targetMention, initialQuestion, roleLabel, rounds = 3) {
  await resolveAnyPendingObjection(channel, guild, targetMention);

  const a1 = await askAndWait(channel, personId, initialQuestion);
  if (!a1) return null;
  if (rounds < 2) return a1;

  await resolveAnyPendingObjection(channel, guild, targetMention);

  const followUp1 = await generateFollowUp(guild, channel.name, roleLabel, a1, targetMention, 1);
  const a2 = await askAndWait(channel, personId, `${personMention}, ${followUp1}`);
  if (!a2 || rounds < 3) return [a1, a2].filter(Boolean).join(' / ');

  await resolveAnyPendingObjection(channel, guild, targetMention);

  const followUp2 = await generateFollowUp(guild, channel.name, roleLabel, `${a1} ${a2}`, targetMention, 2);
  const a3 = await askAndWait(channel, personId, `${personMention}, ${followUp2}`);
  return [a1, a2, a3].filter(Boolean).join(' / ');
}

// Si hay una objecion en cola para este canal, la saca de la cola, la narra
// con la IA (tipo interrupcion de sala de audiencia) y sigue. No detiene el
// interrogatorio, solo lo interrumpe un momento -- es un efecto narrativo,
// no cambia quien tiene el turno de hablar.
async function resolveAnyPendingObjection(channel, guild, targetMention) {
  const queue = consumeObjections(channel.id);
  if (!queue.length) return;

  for (const obj of queue) {
    const objMention = `<@${obj.userId}>`;
    const prompt =
      `Juicio de mentira contra ${targetMention}. Abogado de la ${obj.side} (${objMention}) grito ` +
      `"💪 OBJECION", motivo: "${capText(obj.motivo, 150)}". ` +
      `Narra en 1-2 lineas la reaccion de la sala (humor, sin resolverla en serio). ${STYLE_RULES}`;
    const resp = await askAI([{ role: 'user', content: prompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await pause(channel, 800);
    await channel.send({
      content: `💪 **${objMention} OBJECION!**\n${resp?.text?.trim() || 'la sala queda en silencio un segundo...'}`,
      allowedMentions: { users: [obj.userId] },
    });
  }
}

// Le pide a la IA una repregunta corta basada en lo que la persona acaba
// de responder, para que el interrogatorio se sienta vivo en vez de
// siempre la misma pregunta generica. `intensity` 1 = repregunta normal
// que pide elaborar; 2 = repregunta final, mas picante/comprometedora,
// como el "golpe de gracia" del interrogatorio.
async function generateFollowUp(guild, channelName, roleLabel, previousAnswer, targetMention, intensity = 1) {
  const intensityInstruction = intensity >= 2
    ? 'Es la ULTIMA repregunta: mas picante/comprometedora, busca la contradiccion.'
    : 'Que elabore mas o quede en un aprieto gracioso, sin ser la mas fuerte (guardate algo).';
  const prompt =
    `Juicio de mentira contra ${targetMention}. El/la ${roleLabel} respondio: "${capText(previousAnswer, 300)}". ` +
    `UNA repregunta corta (max 2 lineas). ${intensityInstruction} ${STYLE_RULES} Responde SOLO la pregunta.`;

  const response = await askAI([{ role: 'user', content: prompt }], 0, { guild, channelName, swearingAllowed: false }).catch(() => null);
  return response?.text?.trim() || '¿algo mas que quieras agregar antes de que sigamos?';
}

async function sendInParts(channel, text) {
  // Un solo mensaje final en vez de 4 separados, para reducir ruido/pings.
  // Discord corta en 2000 chars; si el veredicto entero entra, va todo
  // junto. Si por algun motivo es mas largo, ahi si lo partimos.
  const joined = text.split(SECTION_DELIM).map(p => p.trim()).filter(Boolean).join('\n\n');
  if (joined.length <= 1900) {
    await sendNarration(channel, joined);
    return;
  }
  const parts = text.split(SECTION_DELIM).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    await pause(channel, 1800 + Math.random() * 1200);
    await sendNarration(channel, part);
  }
}

// Le da a `personId` una ventana para etiquetar hasta MAX_LAWYERS_PER_SIDE
// "abogados" propios. Filtra bots, a la propia persona, al objetivo del
// juicio y a cualquiera ya tomado por el otro bando (excludeIds), y corta
// la lista al tope para que no se sumen 10 personas de una. Si la persona
// pide mas tiempo (y no mando ninguna mencion en ese mensaje), le da UNA
// extension de la misma duracion antes de cerrar la ventana.
async function collectLawyers(channel, personId, personMention, excludeIds, sideLabel, timeMs = LAWYERS_WINDOW_MS, allowExtension = true) {
  await pause(channel, 1200);
  await channel.send(
    `${personMention}, tenes esta ventana para etiquetar hasta ${MAX_LAWYERS_PER_SIDE} "abogados" ${sideLabel} si queres ayuda (mencionalos en un mensaje). Si no queres, dejalo pasar.\n${formatDiscordTime(timeMs)}`
  );
  markPending(channel.id, personId);
  const collected = await channel
    .awaitMessages({ filter: m => m.author.id === personId, max: 1, time: timeMs, errors: ['time'] })
    .catch(() => null);
  unmarkPending(channel.id, personId);

  if (!collected) return [];

  const firstMsg = collected.first();
  const mentioned = [...firstMsg.mentions.users.values()]
    .filter(u => !u.bot && u.id !== personId && !excludeIds.has(u.id));

  if (mentioned.length === 0 && allowExtension && asksForMoreTime(firstMsg.content)) {
    await pause(channel, 900);
    await channel.send(formatDiscordTime(timeMs, '⏳ Tiempo extra'));
    return collectLawyers(channel, personId, personMention, excludeIds, sideLabel, timeMs, false);
  }

  // dedupe por si mencionaron al mismo dos veces, y recorta al tope
  const seen = new Set();
  const capped = [];
  for (const u of mentioned) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    capped.push(u);
    if (capped.length >= MAX_LAWYERS_PER_SIDE) break;
  }
  return capped;
}

async function collectWitnessVolunteers(channel, waitMs, excludedIds = new Set(), sharedState = null) {
  const volunteers = new Map();
  const witnessMsg = await channel.send({
    content:
      `🙋 ventana de testigos abierta. Si alguien quiere sumarse, pulse el boton. Cupo maximo ${MAX_WITNESSES_PER_SIDE} por bando.\n${formatDiscordTime(waitMs)}`,
    components: buildButtons([
      { id: `funador-witness:${channel.id}`, label: 'Quiero ser testigo', style: ButtonStyle.Primary },
    ]),
  });

  const collector = witnessMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: waitMs,
    filter: i => i.customId === `funador-witness:${channel.id}`,
  });

  collector.on('collect', async i => {
    if (i.user.bot || excludedIds.has(i.user.id)) {
      await i.reply({ content: 'en esta ronda no te puedo anotar como testigo.', ephemeral: true }).catch(() => {});
      return;
    }
    volunteers.set(i.user.id, i.user);
    await i.reply({ content: 'anotado como posible testigo.', ephemeral: true }).catch(() => {});
  });

  const watcher = sharedState
    ? setInterval(() => {
      if (sharedState.closed) collector.stop('skip-all');
    }, 1000)
    : null;

  await new Promise(resolve => collector.on('end', resolve));
  if (watcher) clearInterval(watcher);
  await witnessMsg.edit({ components: [] }).catch(() => {});
  return [...volunteers.values()];
}

// Clasifica cada testigo como a favor o en contra de targetMention segun
// lo que se hablo en el canal (recentText), y recorta cada bando al tope
// MAX_WITNESSES_PER_SIDE. Si la IA falla, reparte en orden de llegada.
// Devuelve { kept: [...], leftOut: [...] } para poder avisar a quien quedo
// afuera por exceso de gente en su bando.
async function classifyAndCapWitnesses(guild, channelName, targetMention, witnesses, recentText) {
  if (witnesses.length === 0) return { kept: [], leftOut: [] };

  // Con un solo testigo no hace falta preguntarle nada a la IA (y evita
  // el bug real: si la IA devuelve ese mismo <@id> en favor Y en contra,
  // o repetido dentro del mismo array, el testigo terminaba contado 2-3
  // veces y por lo tanto interrogado 2-3 veces seguidas en el paso 6).
  // Con 1 testigo, lo mandamos directo a un bando por sorteo simple.
  if (witnesses.length === 1) {
    return { kept: [witnesses[0]], leftOut: [] };
  }

  const witnessList = witnesses.map(w => `<@${w.id}>`).join(', ');
  const prompt =
    `Juicio de mentira contra ${targetMention}. Testigos anotados: ${witnessList}. ` +
    `Segun el historial, clasifica cada uno como A FAVOR o EN CONTRA de ${targetMention} ` +
    `(sin pistas claras, reparti parejo). Cada persona en UN SOLO bando, sin repetir.\n` +
    `Historial:\n${capText(recentText, 700) || '(sin historial, reparti parejo)'}\n\n` +
    `Responde SOLO JSON: {"favor": ["<@id>", ...], "contra": ["<@id>", ...]}`;

  const resp = await askAI([{ role: 'user', content: prompt }], 0, { guild, channelName, swearingAllowed: false }).catch(() => null);

  let favorIds = [];
  let contraIds = [];
  try {
    const clean = (resp?.text || '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    favorIds = Array.isArray(parsed.favor) ? parsed.favor : [];
    contraIds = Array.isArray(parsed.contra) ? parsed.contra : [];
  } catch {
    // fallback: reparte en orden de llegada, mitad y mitad
    witnesses.forEach((w, i) => {
      (i % 2 === 0 ? favorIds : contraIds).push(`<@${w.id}>`);
    });
  }

  // Dedupe DURO: cada persona entra UNA sola vez, sin importar si la IA
  // la repitio dentro del mismo array o la puso en los dos arrays a la
  // vez (favor tiene prioridad si aparece en ambos). Esto es lo que
  // evitaba que un testigo terminara interrogado varias veces seguidas.
  const seenIds = new Set();
  const byMention = new Map(witnesses.map(w => [`<@${w.id}>`, w]));

  const favorUsers = [];
  for (const m of favorIds) {
    const u = byMention.get(m);
    if (!u || seenIds.has(u.id)) continue;
    seenIds.add(u.id);
    favorUsers.push(u);
  }

  const contraUsers = [];
  for (const m of contraIds) {
    const u = byMention.get(m);
    if (!u || seenIds.has(u.id)) continue;
    seenIds.add(u.id);
    contraUsers.push(u);
  }

  // por si la IA se olvido de alguien, lo mandamos al bando mas corto
  for (const w of witnesses) {
    if (seenIds.has(w.id)) continue;
    seenIds.add(w.id);
    (favorUsers.length <= contraUsers.length ? favorUsers : contraUsers).push(w);
  }

  const kept = [...favorUsers.slice(0, MAX_WITNESSES_PER_SIDE), ...contraUsers.slice(0, MAX_WITNESSES_PER_SIDE)];
  const keptIds = new Set(kept.map(u => u.id));
  const leftOut = witnesses.filter(w => !keptIds.has(w.id));

  return { kept, leftOut };
}

// Espera `waitMs` pero permite cortarla antes si TODOS los "votantes"
// (abogados de ambos bandos + acusado + acusador, los que existan)
// reaccionan con 🕐 pidiendo saltarla. Si no hay votantes definidos (nadie
// para votar todavia, ej. antes de que se sepa quien es abogado), simplemente
// espera el tiempo completo.
async function waitOrSkipByVote(channel, waitMs, voterIds, skipLabel, sharedState = null) {
  if (!voterIds || voterIds.size === 0) {
    await new Promise(r => setTimeout(r, waitMs));
    return;
  }

  const votedIds = new Set();
  const voteMsg = await channel.send({
    content: `⏱️ ${skipLabel}. Si todos los involucrados pulsan "saltar", seguimos antes.\n${formatDiscordTime(waitMs)}`,
    components: buildButtons([
      { id: `funador-skip:${channel.id}`, label: 'Saltar espera', style: ButtonStyle.Secondary },
    ]),
  });

  const collector = voteMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: waitMs,
    filter: i => i.customId === `funador-skip:${channel.id}` && voterIds.has(i.user.id),
  });

  return new Promise(resolve => {
    let done = false;
    const finish = async (skipped) => {
      if (done) return;
      done = true;
      collector.stop();
      if (sharedState) sharedState.closed = skipped;
      await voteMsg.edit({ components: [] }).catch(() => {});
      if (skipped) {
        await channel.send('todos votaron saltar, seguimos ⏩').catch(() => {});
      }
      resolve();
    };

    collector.on('collect', async i => {
      votedIds.add(i.user.id);
      const faltan = [...voterIds].filter(id => !votedIds.has(id)).length;
      if ([...voterIds].every(id => votedIds.has(id))) {
        await i.update({ components: [] }).catch(() => {});
        await finish(true);
        return;
      }
      await i.reply({ content: `anotado. Faltan ${faltan} voto(s).`, ephemeral: true }).catch(() => {});
    });

    collector.on('end', async () => {
      await finish(false);
    });
  });
}

export async function startFunadorSession(interaction, targetUser, razon = null) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const channelId = channel.id;
  const initiatorMention = `<@${interaction.user.id}>`;
  const targetMention = `<@${targetUser.id}>`;
  const initiatorLabel = formatUserLabel(interaction.user, initiatorMention);
  const targetLabel = formatUserLabel(targetUser, targetMention);

  const sendAck = async (payload) => {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(async () => {
        await interaction.followUp(payload).catch(() => {});
      });
      return;
    }
    await interaction.reply(payload);
  };

  if (activeSessions.has(channelId)) {
    await sendAck({ content: 'ya hay un juicio en curso en este canal, esperemos a que termine', ephemeral: true });
    return;
  }
  if (targetUser.bot) {
    await sendAck({ content: 'no le puedo hacer un juicio a otro bot', ephemeral: true });
    return;
  }

  activeSessions.add(channelId);
  await sendAck({ content: 'arrancando el juicio...', ephemeral: false });

  try {
    // ── 0. Fetchea historial reciente y arma contexto inicial ────────────
    const razonLimpia = razon?.trim() || null;
    let juicioContext;

    if (razonLimpia) {
      juicioContext = razonLimpia;
    } else {
      const rawHistory = await fetchRecentChannelHistory(channel, HISTORY_LOOKBACK_MS);
      const historyText = capText(
        rawHistory.map(m => `${m.author}: ${m.content}`).join('\n'),
        900 // este prompt solo necesita pistas para armar 2-3 lineas, no el historial entero
      );

      const contextPrompt =
        `Juicio de mentira contra ${targetLabel}. Chat reciente:\n${historyText || '(sin historial reciente)'}\n\n` +
        `Resumi en 2-3 lineas que acusaciones le podrian caber a ${targetLabel} SOLO segun lo de arriba. ` +
        `Si no hay casi nada, decí "sin contexto especifico".`;
      const contextResp = await askAI([{ role: 'user', content: contextPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
      juicioContext = contextResp?.text?.trim() || 'sin contexto especifico';
    }

    // ── 1. Consentimiento del acusado, obligatorio ──────────────────────
    const accepted = await askConsentWithButtons(channel, targetUser, initiatorLabel, targetLabel, razonLimpia);
    if (!accepted) {
      await channel.send(`bueno, quedamos ahi entonces, no hay juicio 🤝 (${targetMention} no dijo que si o no contesto a tiempo)`);
      return;
    }

    // ── 2. Ambos bandos pueden tagear "abogados", 20s c/u, tope 3 c/u ────
    const excludeForDefense = new Set([interaction.user.id, targetUser.id]);
    const lawyerUsers = await collectLawyers(channel, targetUser.id, targetMention, excludeForDefense, 'de tu lado');
    const lawyerMentions = lawyerUsers.map(u => `<@${u.id}>`);

    await pause(channel, 1000);
    // (el aviso individual de "defensa anotada" ahora va en el resumen unico del paso 4, para no re-pingear)

    const excludeForAccuser = new Set([interaction.user.id, targetUser.id, ...lawyerUsers.map(u => u.id)]);
    const accuserLawyerUsers = await collectLawyers(channel, interaction.user.id, initiatorMention, excludeForAccuser, 'para tu lado (acusacion)');
    const accuserLawyerMentions = accuserLawyerUsers.map(u => `<@${u.id}>`);

    // Registra roles para que /objecion sepa quien puede objetar y a quien,
    // desde este punto en adelante (recien ahora se conocen los abogados).
    sessionRoles.set(channelId, {
      targetId: targetUser.id,
      initiatorId: interaction.user.id,
      defenseLawyerIds: new Set(lawyerUsers.map(u => u.id)),
      accuserLawyerIds: new Set(accuserLawyerUsers.map(u => u.id)),
    });

    await pause(channel, 1000);
    // (el aviso individual de "apoyo de la acusacion anotado" ahora va en el resumen unico del paso 4)

    // ── 3. Invitacion abierta a testigos, opcional, tope 4 por bando ─────
    const witnessVoters = new Set([targetUser.id, interaction.user.id, ...lawyerUsers.map(u => u.id), ...accuserLawyerUsers.map(u => u.id)]);
    const excludedWitnessIds = new Set([targetUser.id, interaction.user.id, ...lawyerUsers.map(u => u.id), ...accuserLawyerUsers.map(u => u.id)]);
    const witnessWindowState = { closed: false };
    const [rawWitnesses] = await Promise.all([
      collectWitnessVolunteers(channel, WITNESS_WINDOW_MS, excludedWitnessIds, witnessWindowState),
      waitOrSkipByVote(channel, WITNESS_WINDOW_MS, witnessVoters, 'ventana de testigos abierta', witnessWindowState),
    ]);

    const memory = await getMemory(channelId, guild?.id).catch(() => ({ messages: [] }));
    const recentText = (memory.messages || [])
      .slice(-25)
      .map(m => `${m.authorName || m.displayName || m.role || 'alguien'}: ${m.content}`)
      .join('\n');

    // Clasifica a cada testigo como a-favor/en-contra y recorta cada bando
    // al tope MAX_WITNESSES_PER_SIDE, para que no se sumen 15 personas.
    const { kept: witnesses, leftOut } = await classifyAndCapWitnesses(guild, channel.name, targetLabel, rawWitnesses, recentText);
    const witnessMentions = witnesses.map(w => `<@${w.id}>`);

    if (leftOut.length) {
      // aviso incluido en el resumen unico del paso 4, no como mensaje aparte
    }

    // ── 4. Apertura + roles, TODO en un solo mensaje resumen ─────────────
    // (antes se mandaban 4 mensajes separados re-pingeando gente; ahora es
    // un solo resumen con todos los roles y menciones agrupadas).
    await pause(channel, 1500);
    const rolesSummary = [
      `⚖️ **Se abre la sesion.** ${initiatorMention} pidio este juicio de mentira contra ${targetMention}.`,
      `📄 Tema: ${juicioContext}`,
      lawyerMentions.length ? `🛡️ Defensa: ${lawyerMentions.join(', ')}` : '🛡️ Defensa: nadie, se defiende solo/a',
      accuserLawyerMentions.length ? `📋 Apoyo de la acusacion: ${accuserLawyerMentions.join(', ')}` : '📋 Apoyo de la acusacion: nadie mas',
      witnessMentions.length ? `🙋 Testigos: ${witnessMentions.join(', ')}` : '🙋 Testigos: ninguno se sumo',
      leftOut.length ? `🙏 Se quedaron afuera por cupo lleno: ${leftOut.map(w => `<@${w.id}>`).join(', ')}` : null,
    ].filter(Boolean).join('\n');
    await channel.send({ content: rolesSummary, allowedMentions: { users: [...new Set([targetUser.id, interaction.user.id, ...lawyerUsers.map(u => u.id), ...accuserLawyerUsers.map(u => u.id), ...witnesses.map(u => u.id)])] } });

    const fiscaliaPrompt =
      `Apertura de la fiscalia, juicio de mentira contra ${targetLabel} (${targetMention} acepto jugar, ${initiatorLabel} lo propuso). ` +
      `Usa SOLO el tema dado y el historial (no inventes acusaciones nuevas). ` +
      `TEMA: ${juicioContext}\n${STYLE_RULES}\n` +
      `Historial:\n${capText(recentText) || '(casi sin historial, usa el tema)'}`;
    const fiscaliaResp = await askAI([{ role: 'user', content: fiscaliaPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await pause(channel, 1500);
    await sendNarration(channel, fiscaliaResp?.text?.trim() || `La fiscalia dice que ${targetMention} tiene mucho que explicar hoy.`);

    // ── 5. Interrogatorio al acusado: 3 rondas reales ────────────────────
    await pause(channel, 1500);
    await channel.send(`🎤 Turno de la defensa. ${targetMention}, empecemos.`);
    const defenseText = await interrogate(
      channel, guild, targetUser.id, targetMention, targetLabel,
      `${targetMention}, ¿que pruebas o defensa tenes para este juicio?`,
      'acusado'
    );
    if (!defenseText) {
      await pause(channel, 1200);
      await channel.send(`${targetMention} se quedo callado, no presento defensa... eso no pinta bien 👀`);
    }

    // ── 6. Interrogatorio a testigos (si hay): 3 rondas c/u ──────────────
    // Dedupe extra de seguridad: nunca interrogar dos veces a la misma
    // persona, sin importar de donde venga el duplicado.
    const seenWitnessIds = new Set();
    const uniqueWitnesses = witnesses.filter(w => {
      if (seenWitnessIds.has(w.id)) return false;
      seenWitnessIds.add(w.id);
      return true;
    });
    const testimonies = [];
    for (const witness of uniqueWitnesses) {
      const wMention = `<@${witness.id}>`;
      await pause(channel, 1200);
      await channel.send(`🎤 ${wMention}, tu turno de testigo.`);
      const t = await interrogate(
        channel, guild, witness.id, wMention, targetLabel,
        `${wMention}, ¿que tenes para declarar sobre ${targetMention}?`,
        'testigo'
      );
      if (t) testimonies.push({ mention: wMention, role: 'testigo', text: t });
    }
    if (uniqueWitnesses.length) {
      await pause(channel, 1000);
      await channel.send(testimonies.some(t => t.role === 'testigo') ? 'testimonios de testigos recibidos ✍️' : 'nadie declaro nada al final, seguimos igual 🤷');
    }

    // ── 7. Interrogatorio a los abogados de AMBOS bandos: 3 rondas c/u ───
    for (const lawyer of lawyerUsers) {
      const lMention = `<@${lawyer.id}>`;
      await pause(channel, 1200);
      await channel.send(`🎤 ${lMention}, tu turno como defensa de ${targetMention}.`);
      const l = await interrogate(
        channel, guild, lawyer.id, lMention, targetLabel,
        `${lMention}, ¿que argumentas a favor de ${targetMention}?`,
        'abogado defensor'
      );
      if (l) testimonies.push({ mention: lMention, role: 'abogado defensor', text: l });
    }
    for (const lawyer of accuserLawyerUsers) {
      const lMention = `<@${lawyer.id}>`;
      await pause(channel, 1200);
      await channel.send(`🎤 ${lMention}, tu turno apoyando la acusacion contra ${targetMention}.`);
      const l = await interrogate(
        channel, guild, lawyer.id, lMention, targetLabel,
        `${lMention}, ¿que argumentas en contra de ${targetMention}?`,
        'abogado de la acusacion'
      );
      if (l) testimonies.push({ mention: lMention, role: 'abogado de la acusacion', text: l });
    }

    // ── 8. Testimonio final del acusador ──────────────────────────────────
    await pause(channel, 1200);
    await channel.send(`🎤 Por ultimo, ${initiatorMention} (quien pidio el juicio) tambien tiene derecho a declarar.`);
    const accuserTestimony = await interrogate(
      channel, guild, interaction.user.id, initiatorMention, targetLabel,
      `${initiatorMention}, ¿algo mas que quieras agregar como acusador/a?`,
      'acusador', 1
    );
    if (accuserTestimony) testimonies.push({ mention: initiatorMention, role: 'acusador', text: accuserTestimony });

    // ── 8.5. Alegatos finales de ambos bandos, si hubo alguien defendiendo
    // a cada lado -- son mensajes narrados de cierre, sin volver a
    // preguntarle nada a nadie, para darle mas cuerpo al juicio antes
    // del contra-argumento/veredicto sin alargar de mas la espera real.
    if (lawyerMentions.length || testimonies.some(t => t.role === 'testigo')) {
      const closingDefensePrompt =
        `Alegato final de la DEFENSA de ${targetLabel}, juicio de mentira. ` +
        `Defensa: ${capText(defenseText, 400) || '(no presento defensa)'}\n` +
        `A favor: ${capText(testimonies.filter(t => t.role !== 'acusador' && t.role !== 'abogado de la acusacion').map(t => `${t.mention}: ${t.text}`).join(' | '), 500) || '(ninguna)'}\n` +
        `2-3 lineas, con humor, por que ${targetLabel} deberia salir bien parado. ${STYLE_RULES}`;
      const closingDefenseResp = await askAI([{ role: 'user', content: closingDefensePrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
      await pause(channel, 1500);
      await sendNarration(channel, `📚 **Alegato final de la defensa:**\n${closingDefenseResp?.text?.trim() || `${targetMention} no la tuvo facil, pero dio pelea.`}`);
    }

    // El alegato de la acusacion siempre se narra (siempre hay un
    // acusador, con o sin abogados extra de su lado).
    {
      const closingAccusationPrompt =
        `Alegato final de la ACUSACION contra ${targetLabel}, juicio de mentira. ` +
        `Testimonio del acusador: ${capText(accuserTestimony, 400) || '(no agrego nada nuevo)'}\n` +
        `En contra: ${capText(testimonies.filter(t => t.role === 'abogado de la acusacion' || t.role === 'acusador').map(t => `${t.mention}: ${t.text}`).join(' | '), 500) || '(ninguna)'}\n` +
        `2-3 lineas, con humor, por que ${targetLabel} deberia ser culpable. ${STYLE_RULES}`;
      const closingAccusationResp = await askAI([{ role: 'user', content: closingAccusationPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
      await pause(channel, 1500);
      await sendNarration(channel, `📜 **Alegato final de la acusacion:**\n${closingAccusationResp?.text?.trim() || `la acusacion no va a soltar esto tan facil.`}`);
    }

    // ── 9. Contra-argumento narrado ───────────────────────────────────────
    await pause(channel, 1800);
    const testimoniesBlock = testimonies.length
      ? testimonies.map(t => `${t.mention} (${t.role}): ${t.text}`).join(' | ')
      : '(sin testimonios de nadie)';
    const contraPrompt =
      `Contra-argumento, juicio de mentira contra ${targetLabel}. ` +
      `Defensa: ${capText(defenseText, 500) || '(no presento defensa)'}\n` +
      `Otras declaraciones: ${capText(testimoniesBlock, 700)}\n` +
      `Compara que tan bien se sostiene ${targetLabel}. ${STYLE_RULES}`;
    const contraResp = await askAI([{ role: 'user', content: contraPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await sendNarration(channel, contraResp?.text?.trim() || `la cosa esta reñida entre la defensa de ${targetMention} y el resto...`);

    // ── 10. Deliberacion + veredicto final ─────────────────────────────────
    await pause(channel, 1800);
    await channel.send('dejenme deliberar un toque... ⚖️');

    const veredictoPrompt =
      `Sos el juez de un juicio de mentira (${targetLabel} acepto jugar, propuesto por ${initiatorLabel}). ` +
      `Juzga por lo que REALMENTE dijo cada uno, no por su rol/etiqueta (un abogado defensor que perjudico a ` +
      `${targetLabel} cuenta en contra; un testigo que lo defendio cuenta a favor).\n` +
      `TEMA: ${juicioContext}\n` +
      `Defensa: ${capText(defenseText, 500) || '(no presento defensa)'}\n` +
      `Otras declaraciones: ${capText(testimoniesBlock, 900)}\n` +
      `Historial:\n${capText(recentText, 600) || '(sin historial relevante)'}\n\n` +
      `Responde en EXACTAMENTE 4 partes separadas por ${SECTION_DELIM} (sin numerar, max 3 lineas c/u):\n` +
      `1) **Analisis:** quien jugo a favor/en contra de ${targetLabel} y por que.\n` +
      `2) **Defensa:** si se sostuvo o no.\n` +
      `3) **Resultado:** que tan cerrado o aplastante, con humor.\n` +
      `4) Empeza con "🏛️ **VEREDICTO FINAL**" y el veredicto gracioso/liviano (ej: "culpable de ser un migajero"), sin sanciones reales. ${STYLE_RULES}`;
    let veredictoResp = await askAI([{ role: 'user', content: veredictoPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);

    // Si fallo o vino vacio, reintentamos UNA vez antes de rendirnos, para
    // no dejar el juicio colgado sin cierre (le paso al usuario que hubo
    // que reintentar).
    if (!veredictoResp?.text) {
      await pause(channel, 1200);
      veredictoResp = await askAI([{ role: 'user', content: veredictoPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    }

    if (!veredictoResp?.text) {
      await channel.send('se me trabo la cabeza armando el veredicto un par de veces, probemos de nuevo en un rato 😅');
      return;
    }

    await sendInParts(channel, veredictoResp.text);
  } catch (err) {
    console.error('[funadorSession]', err.message);
    await channel.send('algo se rompio armando el juicio, quedo cancelado por ahora').catch(() => {});
  } finally {
    activeSessions.delete(channelId);
    pendingAnswers.delete(channelId);
    sessionRoles.delete(channelId);
    pendingObjections.delete(channelId);
  }
}

export default { startFunadorSession, isPendingFunadorAnswer, registerObjection, getSessionRoles };
