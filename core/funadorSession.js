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
import { getMemory } from './memory.js';
import { humanizedTyping } from './typingDelay.js';

const CONSENT_TIMEOUT_MS = 2 * 60 * 1000;   // 2 min para que el acusado consienta
const LAWYERS_WINDOW_MS = 20 * 1000;        // 20s para etiquetar abogados (ambos bandos)
const WITNESS_WINDOW_MS = 45 * 1000;        // 45s abiertos para sumarse como testigo
const ANSWER_TIMEOUT_MS = 75 * 1000;        // 75s por cada respuesta esperada en una ronda
const MAX_LAWYERS_PER_SIDE = 3;             // tope de abogados, por bando
const MAX_WITNESSES_PER_SIDE = 4;           // tope de testigos, por bando
const HISTORY_LOOKBACK_MS = 10 * 60 * 1000; // 10 min de historial antes del juicio para contexto

const SECTION_DELIM = '|||SECCION|||';
const STYLE_RULES =
  'Reglas obligatorias: (1) para nombrar a alguien usa EXCLUSIVAMENTE las menciones exactas ' +
  'que te doy entre <> (ej: <@123>), nunca inventes ni uses un nombre de usuario suelto; ' +
  '(2) maximo 3 lineas cortas, nada de parrafos largos; (3) tono comedia amistosa tipo reality ' +
  'show, nunca cruel, nunca insultos reales; (4) no inventes acusaciones que no esten en lo que te paso.';

// channelId -> true mientras hay una sesion en curso (evita solapar bits)
const activeSessions = new Set();

// channelId -> { targetId, initiatorId, defenseLawyerIds:Set, accuserLawyerIds:Set }
// Se llena en cuanto se conocen los abogados de cada bando, y se borra al
// terminar la sesion. Lo usa /objecion para validar quien puede objetar y
// contra que bando, sin tener que ser Lara/Gio.
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

function buildConsentPrompt(initiatorMention, targetMention) {
  return (
    `${targetMention}, ${initiatorMention} quiere armarte un "juicio" de mentira, todo en joda 🎭\n` +
    `Nada de esto es en serio, es solo un bit divertido con lo que ya se hablo en el canal.\n` +
    `¿Te copa jugar? Reacciona con ✅ si queres, o con ❌ si mejor no.`
  );
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
  await channel.send(question);
  markPending(channel.id, userId);
  try {
    const collected = await channel
      .awaitMessages({ filter: m => m.author.id === userId, max: 1, time: timeMs, errors: ['time'] })
      .catch(() => null);
    const text = collected?.first()?.content?.trim() || null;

    if (text && asksForMoreTime(text) && allowExtension) {
      await pause(channel, 900);
      await channel.send(`dale, tomate ${Math.round(timeMs / 1000)}s mas 🕐`);
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
      `Estas narrando un juicio de mentira contra ${targetMention}. Un abogado de la ${obj.side} ` +
      `(${objMention}) acaba de gritar "💪 OBJECION" con este motivo: "${obj.motivo}". ` +
      `Narra en 1-2 lineas como reacciona la sala a esa objecion (con humor, sin resolverla de forma seria, ` +
      `es solo un momento dramatico de comedia). ${STYLE_RULES}`;
    const resp = await askAI([{ role: 'user', content: prompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await pause(channel, 800);
    await channel.send(`💪 **${objMention} OBJECION!**\n${resp?.text?.trim() || 'la sala queda en silencio un segundo...'}`);
  }
}

// Le pide a la IA una repregunta corta basada en lo que la persona acaba
// de responder, para que el interrogatorio se sienta vivo en vez de
// siempre la misma pregunta generica. `intensity` 1 = repregunta normal
// que pide elaborar; 2 = repregunta final, mas picante/comprometedora,
// como el "golpe de gracia" del interrogatorio.
async function generateFollowUp(guild, channelName, roleLabel, previousAnswer, targetMention, intensity = 1) {
  const intensityInstruction = intensity >= 2
    ? 'Esta es la ULTIMA repregunta de la ronda, asi que hacela mas picante y comprometedora que la anterior, buscando la contradiccion o el punto flojo de lo que dijo.'
    : 'Hacela para que elabore mas o quede en un aprieto gracioso, sin ser la mas fuerte todavia (guardate algo para despues).';
  const prompt =
    `Estas narrando un juicio de mentira, tipo juego, contra ${targetMention}. ` +
    `El/la ${roleLabel} acaba de responder esto: "${previousAnswer}". ` +
    `Escribi UNA sola repregunta corta (maximo 2 lineas). ${intensityInstruction} ${STYLE_RULES} Responde SOLO con la pregunta, nada mas.`;

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
    `${personMention}, tenes ${Math.round(timeMs / 1000)}s para etiquetar hasta ${MAX_LAWYERS_PER_SIDE} "abogados" ${sideLabel} si queres ayuda (mencionalos en un mensaje). Si no queres, dejalo pasar.`
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
    await channel.send(`dale, tomate ${Math.round(timeMs / 1000)}s mas 🕐`);
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
    `Estas por armar un juicio de mentira contra ${targetMention}. Estas personas se anotaron ` +
    `como testigos: ${witnessList}. Basandote en este historial reciente del canal, decidi para ` +
    `cada una si probablemente va a jugar A FAVOR o EN CONTRA de ${targetMention} (si no hay pistas claras, ` +
    `repartilos de forma pareja entre los dos bandos). CADA PERSONA VA EN UN SOLO BANDO, NUNCA la repitas ` +
    `en los dos arrays ni la pongas dos veces en el mismo array.\n\n` +
    `Historial:\n${recentText || '(sin historial relevante, reparti parejo)'}\n\n` +
    `Responde SOLO con JSON valido, sin texto extra, con este formato exacto: ` +
    `{"favor": ["<@id>", ...], "contra": ["<@id>", ...]}`;

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
async function waitOrSkipByVote(channel, waitMs, voterIds, skipLabel) {
  if (!voterIds || voterIds.size === 0) {
    await new Promise(r => setTimeout(r, waitMs));
    return;
  }

  const voteMsg = await channel.send(
    `⏱️ ${skipLabel} (${Math.round(waitMs / 1000)}s). Si TODOS los involucrados (abogados de ambos lados, acusado y acusador) reaccionan con 🕐, saltamos el tiempo restante.`
  );
  await voteMsg.react('🕐');

  const start = Date.now();
  const pollMs = 2000;
  while (Date.now() - start < waitMs) {
    await new Promise(r => setTimeout(r, pollMs));
    const reaction = voteMsg.reactions.cache.get('⏰') || voteMsg.reactions.cache.get('🕐');
    if (!reaction) continue;
    const voted = await reaction.users.fetch().catch(() => new Map());
    const votedIds = new Set([...voted.values()].filter(u => !u.bot).map(u => u.id));
    const allVoted = [...voterIds].every(id => votedIds.has(id));
    if (allVoted) {
      await channel.send('todos votaron saltar, seguimos ⏩').catch(() => {});
      return;
    }
  }
}

export async function startFunadorSession(interaction, targetUser, razon = null) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const channelId = channel.id;
  const initiatorMention = `<@${interaction.user.id}>`;
  const targetMention = `<@${targetUser.id}>`;

  if (activeSessions.has(channelId)) {
    await interaction.reply({ content: 'ya hay un juicio en curso en este canal, esperemos a que termine 😅', ephemeral: true });
    return;
  }
  if (targetUser.bot) {
    await interaction.reply({ content: 'no le puedo hacer un juicio a otro bot, jaja', ephemeral: true });
    return;
  }

  activeSessions.add(channelId);
  await interaction.reply({ content: `dale, le pregunto a ${targetMention} si quiere jugar 👀`, ephemeral: false });

  try {
    // ── 0. Fetchea historial reciente y arma contexto inicial ────────────
    const razonLimpia = razon?.trim() || null;
    let juicioContext;

    if (razonLimpia) {
      juicioContext = razonLimpia;
    } else {
      const rawHistory = await fetchRecentChannelHistory(channel, HISTORY_LOOKBACK_MS);
      const historyText = rawHistory
        .map(m => `${m.author}: ${m.content}`)
        .join('\n');

      const contextPrompt =
        `Estas por armar un juicio de mentira contra ${targetMention}. Estos son los ultimos 10 minutos de chat:\n\n${historyText || '(sin historial reciente)'}\n\n` +
        `Resume brevemente (max 2-3 lineas) que tipo de acusaciones podrian hacerle a ${targetMention} basandote SOLO en lo que ves arriba. ` +
        `Si no hay casi nada, simplemente di "sin contexto especifico".`;
      const contextResp = await askAI([{ role: 'user', content: contextPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
      juicioContext = contextResp?.text?.trim() || 'sin contexto especifico';
    }

    // ── 1. Consentimiento del acusado, obligatorio ──────────────────────
    const consentMsg = await channel.send(buildConsentPrompt(initiatorMention, targetMention, razonLimpia));
    await consentMsg.react('✅');
    await consentMsg.react('❌');

    const consentCollected = await consentMsg
      .awaitReactions({
        filter: (reaction, user) => user.id === targetUser.id && ['✅', '❌'].includes(reaction.emoji.name),
        max: 1,
        time: CONSENT_TIMEOUT_MS,
        errors: ['time'],
      })
      .catch(() => null);

    const accepted = consentCollected && [...consentCollected.values()][0]?.emoji.name === '✅';
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
    const witnessMsg = await channel.send(
      `sigue en pie 🎉 el que quiera sumarse de testigo, que reaccione con 🙋 en los proximos ${WITNESS_WINDOW_MS / 1000}s ` +
      `(opcional, nadie esta obligado, maximo ${MAX_WITNESSES_PER_SIDE} testigos por bando).`
    );
    await witnessMsg.react('🙋');
    const witnessVoters = new Set([targetUser.id, interaction.user.id, ...lawyerUsers.map(u => u.id), ...accuserLawyerUsers.map(u => u.id)]);
    await waitOrSkipByVote(channel, WITNESS_WINDOW_MS, witnessVoters, 'ventana de testigos abierta');
    const reactionUsers = witnessMsg.reactions.cache.get('🙋')
      ? await witnessMsg.reactions.cache.get('🙋').users.fetch().catch(() => new Map())
      : new Map();
    const rawWitnesses = [...reactionUsers.values()].filter(u => !u.bot && u.id !== targetUser.id && u.id !== interaction.user.id && !lawyerUsers.some(l => l.id === u.id) && !accuserLawyerUsers.some(l => l.id === u.id));

    const memory = await getMemory(channelId, guild?.id).catch(() => ({ messages: [] }));
    const recentText = (memory.messages || [])
      .slice(-25)
      .map(m => `${m.authorName || m.role}: ${m.content}`)
      .join('\n');

    // Clasifica a cada testigo como a-favor/en-contra y recorta cada bando
    // al tope MAX_WITNESSES_PER_SIDE, para que no se sumen 15 personas.
    const { kept: witnesses, leftOut } = await classifyAndCapWitnesses(guild, channel.name, targetMention, rawWitnesses, recentText);
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
      lawyerMentions.length ? `🛡️ Defensa: ${lawyerMentions.join(', ')}` : '🛡️ Defensa: nadie, se defiende solo/a',
      accuserLawyerMentions.length ? `📋 Apoyo de la acusacion: ${accuserLawyerMentions.join(', ')}` : '📋 Apoyo de la acusacion: nadie mas',
      witnessMentions.length ? `🙋 Testigos: ${witnessMentions.join(', ')}` : '🙋 Testigos: ninguno se sumo',
      leftOut.length ? `🙏 Se quedaron afuera por cupo lleno: ${leftOut.map(w => `<@${w.id}>`).join(', ')}` : null,
    ].filter(Boolean).join('\n');
    await channel.send({ content: rolesSummary, allowedMentions: { users: [...new Set([targetUser.id, interaction.user.id, ...lawyerUsers.map(u => u.id), ...accuserLawyerUsers.map(u => u.id), ...witnesses.map(u => u.id)])] } });

    const fiscaliaPrompt =
      `Estas narrando la apertura de la fiscalia en un juicio de mentira contra ${targetMention}, ` +
      `un juego que ${targetMention} acepto jugar despues de que ${initiatorMention} lo propuso. ` +
      `Usa SOLO lo que aparece en este historial reciente del canal (no inventes acusaciones nuevas). ` +
      `Contexto previo: ${juicioContext}\n` +
      `${STYLE_RULES}\n\n` +
      `Historial:\n${recentText || '(casi no hay historial, improvisa algo liviano sin inventar acusaciones concretas)'}`;
    const fiscaliaResp = await askAI([{ role: 'user', content: fiscaliaPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await pause(channel, 1500);
    await sendNarration(channel, fiscaliaResp?.text?.trim() || `La fiscalia dice que ${targetMention} tiene mucho que explicar hoy.`);

    // ── 5. Interrogatorio al acusado: 3 rondas reales ────────────────────
    await pause(channel, 1500);
    await channel.send(`🎤 Turno de la defensa. ${targetMention}, empecemos.`);
    const defenseText = await interrogate(
      channel, guild, targetUser.id, targetMention, targetMention,
      `${targetMention}, ¿que pruebas o defensa tenes para este juicio? Tenes ${ANSWER_TIMEOUT_MS / 1000}s.`,
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
        channel, guild, witness.id, wMention, targetMention,
        `${wMention}, ¿que tenes para declarar sobre ${targetMention}? Tenes ${ANSWER_TIMEOUT_MS / 1000}s.`,
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
        channel, guild, lawyer.id, lMention, targetMention,
        `${lMention}, ¿que argumentas a favor de ${targetMention}? Tenes ${ANSWER_TIMEOUT_MS / 1000}s.`,
        'abogado defensor'
      );
      if (l) testimonies.push({ mention: lMention, role: 'abogado defensor', text: l });
    }
    for (const lawyer of accuserLawyerUsers) {
      const lMention = `<@${lawyer.id}>`;
      await pause(channel, 1200);
      await channel.send(`🎤 ${lMention}, tu turno apoyando la acusacion contra ${targetMention}.`);
      const l = await interrogate(
        channel, guild, lawyer.id, lMention, targetMention,
        `${lMention}, ¿que argumentas en contra de ${targetMention}? Tenes ${ANSWER_TIMEOUT_MS / 1000}s.`,
        'abogado de la acusacion'
      );
      if (l) testimonies.push({ mention: lMention, role: 'abogado de la acusacion', text: l });
    }

    // ── 8. Testimonio final del acusador ──────────────────────────────────
    await pause(channel, 1200);
    await channel.send(`🎤 Por ultimo, ${initiatorMention} (quien pidio el juicio) tambien tiene derecho a declarar.`);
    const accuserTestimony = await interrogate(
      channel, guild, interaction.user.id, initiatorMention, targetMention,
      `${initiatorMention}, ¿algo mas que quieras agregar como acusador/a? Tenes ${ANSWER_TIMEOUT_MS / 1000}s.`,
      'acusador', 1
    );
    if (accuserTestimony) testimonies.push({ mention: initiatorMention, role: 'acusador', text: accuserTestimony });

    // ── 8.5. Alegatos finales de ambos bandos, si hubo alguien defendiendo
    // a cada lado -- son mensajes narrados de cierre, sin volver a
    // preguntarle nada a nadie, para darle mas cuerpo al juicio antes
    // del contra-argumento/veredicto sin alargar de mas la espera real.
    if (lawyerMentions.length || testimonies.some(t => t.role === 'testigo')) {
      const closingDefensePrompt =
        `Estas narrando el alegato final de la DEFENSA de ${targetMention} en un juicio de mentira. ` +
        `Defensa dada por ${targetMention}: ${defenseText || '(no presento defensa)'}\n` +
        `Declaraciones a favor: ${testimonies.filter(t => t.role !== 'acusador' && t.role !== 'abogado de la acusacion').map(t => `${t.mention}: ${t.text}`).join(' | ') || '(ninguna)'}\n` +
        `Escribi 2-3 lineas resumiendo por que ${targetMention} deberia salir bien parado de esto, con humor. ${STYLE_RULES}`;
      const closingDefenseResp = await askAI([{ role: 'user', content: closingDefensePrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
      await pause(channel, 1500);
      await sendNarration(channel, `📚 **Alegato final de la defensa:**\n${closingDefenseResp?.text?.trim() || `${targetMention} no la tuvo facil, pero dio pelea.`}`);
    }

    // El alegato de la acusacion siempre se narra (siempre hay un
    // acusador, con o sin abogados extra de su lado).
    {
      const closingAccusationPrompt =
        `Estas narrando el alegato final de la ACUSACION contra ${targetMention} en un juicio de mentira. ` +
        `Testimonio del acusador: ${accuserTestimony || '(no agrego nada nuevo)'}\n` +
        `Declaraciones en contra: ${testimonies.filter(t => t.role === 'abogado de la acusacion' || t.role === 'acusador').map(t => `${t.mention}: ${t.text}`).join(' | ') || '(ninguna)'}\n` +
        `Escribi 2-3 lineas resumiendo por que ${targetMention} deberia ser encontrado culpable, con humor. ${STYLE_RULES}`;
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
      `Estas narrando el contra-argumento en un juicio de mentira contra ${targetMention}. ` +
      `Defensa de ${targetMention}: ${defenseText || '(no presento defensa)'}\n` +
      `Otras declaraciones (testigos, abogados, acusador): ${testimoniesBlock}\n` +
      `Compara que tan bien se sostiene ${targetMention} frente a todo lo demas. ${STYLE_RULES}`;
    const contraResp = await askAI([{ role: 'user', content: contraPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await sendNarration(channel, contraResp?.text?.trim() || `la cosa esta reñida entre la defensa de ${targetMention} y el resto...`);

    // ── 10. Deliberacion + veredicto final ─────────────────────────────────
    await pause(channel, 1800);
    await channel.send('dejenme deliberar un toque... ⚖️');

    const veredictoPrompt =
      `Sos el juez de un juicio de mentira (juego que ${targetMention} acepto jugar, propuesto por ${initiatorMention}). ` +
      `Cada participante pudo haber jugado A FAVOR o EN CONTRA de ${targetMention}, sin importar si vino como testigo, ` +
      `abogado (de cualquiera de los dos bandos) o acusador -- juzga por lo que REALMENTE dijeron, no por su rol o etiqueta ` +
      `(un "abogado defensor" que dijo algo que perjudica a ${targetMention} cuenta en contra, y un "testigo" que lo defendio ` +
      `cuenta a favor).\n\n` +
      `Defensa de ${targetMention}: ${defenseText || '(no presento defensa)'}\n` +
      `Declaraciones de otros: ${testimoniesBlock}\n` +
      `Historial reciente del canal:\n${recentText || '(sin historial relevante)'}\n\n` +
      `Estructura tu respuesta en EXACTAMENTE 4 partes separadas por la marca ${SECTION_DELIM} (sin numerarlas, cada parte de maximo 3 lineas):\n` +
      `1) **Analisis:** quien jugo a favor y quien en contra de ${targetMention}, y por que (segun lo que dijeron).\n` +
      `2) **Defensa:** si la defensa de ${targetMention} se sostuvo o no frente a todo eso.\n` +
      `3) **Resultado:** que tan cerrado o aplastante fue, con humor.\n` +
      `4) Empeza esta parte con la linea exacta "🏛️ **VEREDICTO FINAL**" y despues el veredicto gracioso y liviano (tipo "culpable/inocente de [algo tierno/gracioso, ej: ser un migajero]"), sin sanciones reales, dejando claro que fue un juego. ${STYLE_RULES}`;
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
