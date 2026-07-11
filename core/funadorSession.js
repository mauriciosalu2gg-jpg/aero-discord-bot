// core/funadorSession.js
// "Juicio" en broma, tipo juego de mesa entre amigos, narrado en muchas
// etapas reales (nunca un bloque de texto de una sola vez). NUNCA arranca
// sin permiso: primero le pregunta al acusado si quiere jugar, despues
// invita (sin presionar) a que otros se sumen como "testigos" si quieren,
// y solo si el acusado dijo que si se sigue.
//
// Etapas: consentimiento -> ambos bandos pueden tagear "abogados" (20s c/u,
// tope 3 por bando) -> ventana de testigos (45s, tope 4 por bando, clasificados
// dinamicamente por la IA segun el historial) -> apertura + fiscalia ->
// interrogatorio real al acusado (2 rondas) -> interrogatorio a testigos
// (2 rondas c/u) -> interrogatorio a abogados de ambos bandos (2 rondas c/u)
// -> testimonio final del acusador -> contra-argumento -> deliberacion ->
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

const SECTION_DELIM = '|||SECCION|||';
const STYLE_RULES =
  'Reglas obligatorias: (1) para nombrar a alguien usa EXCLUSIVAMENTE las menciones exactas ' +
  'que te doy entre <> (ej: <@123>), nunca inventes ni uses un nombre de usuario suelto; ' +
  '(2) maximo 3 lineas cortas, nada de parrafos largos; (3) tono comedia amistosa tipo reality ' +
  'show, nunca cruel, nunca insultos reales; (4) no inventes acusaciones que no esten en lo que te paso.';

// channelId -> true mientras hay una sesion en curso (evita solapar bits)
const activeSessions = new Set();

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

// Manda un mensaje/pregunta y espera UNA respuesta real de esa persona en
// el canal (o null si no contesto a tiempo). Marca/desmarca "pendiente"
// para que index.js no la mande tambien a la IA normal.
async function askAndWait(channel, userId, question, timeMs = ANSWER_TIMEOUT_MS) {
  await pause(channel, 1300);
  await channel.send(question);
  markPending(channel.id, userId);
  try {
    const collected = await channel
      .awaitMessages({ filter: m => m.author.id === userId, max: 1, time: timeMs, errors: ['time'] })
      .catch(() => null);
    return collected?.first()?.content?.trim() || null;
  } finally {
    unmarkPending(channel.id, userId);
  }
}

// Interrogatorio de 1 o 2 rondas reutilizable para acusado/testigos/abogados.
async function interrogate(channel, guild, personId, personMention, targetMention, initialQuestion, roleLabel, rounds = 2) {
  const a1 = await askAndWait(channel, personId, initialQuestion);
  if (!a1) return null;
  if (rounds < 2) return a1;

  const followUp = await generateFollowUp(guild, channel.name, roleLabel, a1, targetMention);
  const a2 = await askAndWait(channel, personId, `${personMention}, ${followUp}`);
  return [a1, a2].filter(Boolean).join(' / ');
}

// Le pide a la IA una repregunta corta y picante (pero amistosa) basada en
// lo que la persona acaba de responder, para que el interrogatorio se
// sienta vivo en vez de siempre la misma pregunta generica.
async function generateFollowUp(guild, channelName, roleLabel, previousAnswer, targetMention) {
  const prompt =
    `Estas narrando un juicio de mentira, tipo juego, contra ${targetMention}. ` +
    `El/la ${roleLabel} acaba de responder esto: "${previousAnswer}". ` +
    `Escribi UNA sola repregunta corta (maximo 2 lineas) que lo/la haga elaborar mas o lo/la ponga ` +
    `en aprietos de forma graciosa. ${STYLE_RULES} Responde SOLO con la pregunta, nada mas.`;

  const response = await askAI([{ role: 'user', content: prompt }], 0, { guild, channelName, swearingAllowed: false }).catch(() => null);
  return response?.text?.trim() || '¿algo mas que quieras agregar antes de que sigamos?';
}

async function sendInParts(channel, text) {
  const parts = text.split(SECTION_DELIM).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    await pause(channel, 1800 + Math.random() * 1200);
    await channel.send(part);
  }
}

// Le da a `personId` una ventana para etiquetar hasta MAX_LAWYERS_PER_SIDE
// "abogados" propios. Filtra bots, a la propia persona, al objetivo del
// juicio y a cualquiera ya tomado por el otro bando (excludeIds), y corta
// la lista al tope para que no se sumen 10 personas de una.
async function collectLawyers(channel, personId, personMention, excludeIds, sideLabel) {
  await pause(channel, 1200);
  await channel.send(
    `${personMention}, tenes ${LAWYERS_WINDOW_MS / 1000}s para etiquetar hasta ${MAX_LAWYERS_PER_SIDE} "abogados" ${sideLabel} si queres ayuda (mencionalos en un mensaje). Si no queres, dejalo pasar.`
  );
  markPending(channel.id, personId);
  const collected = await channel
    .awaitMessages({ filter: m => m.author.id === personId, max: 1, time: LAWYERS_WINDOW_MS, errors: ['time'] })
    .catch(() => null);
  unmarkPending(channel.id, personId);

  if (!collected) return [];

  const mentioned = [...collected.first().mentions.users.values()]
    .filter(u => !u.bot && u.id !== personId && !excludeIds.has(u.id));

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

  const witnessList = witnesses.map(w => `<@${w.id}>`).join(', ');
  const prompt =
    `Estas por armar un juicio de mentira contra ${targetMention}. Estas personas se anotaron ` +
    `como testigos: ${witnessList}. Basandote en este historial reciente del canal, decidi para ` +
    `cada una si probablemente va a jugar A FAVOR o EN CONTRA de ${targetMention} (si no hay pistas claras, ` +
    `repartilos de forma pareja entre los dos bandos).\n\n` +
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

  const byMention = new Map(witnesses.map(w => [`<@${w.id}>`, w]));
  const favorUsers = favorIds.map(m => byMention.get(m)).filter(Boolean);
  const contraUsers = contraIds.map(m => byMention.get(m)).filter(Boolean);

  // por si la IA se olvido de alguien, lo mandamos al bando mas corto
  const classifiedIds = new Set([...favorUsers, ...contraUsers].map(u => u.id));
  for (const w of witnesses) {
    if (classifiedIds.has(w.id)) continue;
    (favorUsers.length <= contraUsers.length ? favorUsers : contraUsers).push(w);
  }

  const kept = [...favorUsers.slice(0, MAX_WITNESSES_PER_SIDE), ...contraUsers.slice(0, MAX_WITNESSES_PER_SIDE)];
  const keptIds = new Set(kept.map(u => u.id));
  const leftOut = witnesses.filter(w => !keptIds.has(w.id));

  return { kept, leftOut };
}

export async function startFunadorSession(interaction, targetUser) {
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
    // ── 1. Consentimiento del acusado, obligatorio ──────────────────────
    const consentMsg = await channel.send(buildConsentPrompt(initiatorMention, targetMention));
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
    await channel.send(lawyerMentions.length ? `defensa anotada: ${lawyerMentions.join(', ')} ⚖️` : 'sin abogados, se defiende solo/a 💪');

    const excludeForAccuser = new Set([interaction.user.id, targetUser.id, ...lawyerUsers.map(u => u.id)]);
    const accuserLawyerUsers = await collectLawyers(channel, interaction.user.id, initiatorMention, excludeForAccuser, 'para tu lado (acusacion)');
    const accuserLawyerMentions = accuserLawyerUsers.map(u => `<@${u.id}>`);

    await pause(channel, 1000);
    await channel.send(accuserLawyerMentions.length ? `apoyo de la acusacion anotado: ${accuserLawyerMentions.join(', ')} 📋` : `${initiatorMention} sigue solo/a con la acusacion, sin apoyo extra.`);

    // ── 3. Invitacion abierta a testigos, opcional, tope 4 por bando ─────
    const witnessMsg = await channel.send(
      `sigue en pie 🎉 el que quiera sumarse de testigo, que reaccione con 🙋 en los proximos ${WITNESS_WINDOW_MS / 1000}s ` +
      `(opcional, nadie esta obligado, maximo ${MAX_WITNESSES_PER_SIDE} testigos por bando).`
    );
    await witnessMsg.react('🙋');
    await new Promise(r => setTimeout(r, WITNESS_WINDOW_MS));
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
      await pause(channel, 900);
      await channel.send(`ya se lleno el cupo de testigos por bando (max ${MAX_WITNESSES_PER_SIDE} c/u), asi que ${leftOut.map(w => `<@${w.id}>`).join(', ')} se quedan afuera esta vez 🙏`);
    }

    // ── 4. Apertura + fiscalia inicial, narradas ─────────────────────────
    await pause(channel, 1500);
    await channel.send(
      `⚖️ **Se abre la sesion.** ${initiatorMention} pidio este juicio de mentira contra ${targetMention}.` +
      (lawyerMentions.length ? ` Defensa: ${lawyerMentions.join(', ')}.` : '') +
      (accuserLawyerMentions.length ? ` Apoyo de la acusacion: ${accuserLawyerMentions.join(', ')}.` : '') +
      (witnessMentions.length ? ` Testigos: ${witnessMentions.join(', ')}.` : witnessMentions.length === 0 && !lawyerMentions.length && !accuserLawyerMentions.length ? ' Mano a mano, sin apoyo de ningun lado.' : '')
    );

    const fiscaliaPrompt =
      `Estas narrando la apertura de la fiscalia en un juicio de mentira contra ${targetMention}, ` +
      `un juego que ${targetMention} acepto jugar despues de que ${initiatorMention} lo propuso. ` +
      `Usa SOLO lo que aparece en este historial reciente del canal (no inventes acusaciones nuevas). ` +
      `${STYLE_RULES}\n\n` +
      `Historial:\n${recentText || '(casi no hay historial, improvisa algo liviano sin inventar acusaciones concretas)'}`;
    const fiscaliaResp = await askAI([{ role: 'user', content: fiscaliaPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await pause(channel, 1500);
    await channel.send(fiscaliaResp?.text?.trim() || `La fiscalia dice que ${targetMention} tiene mucho que explicar hoy.`);

    // ── 5. Interrogatorio al acusado: 2 rondas reales ────────────────────
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

    // ── 6. Interrogatorio a testigos (si hay): 2 rondas c/u ──────────────
    const testimonies = [];
    for (const witness of witnesses) {
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
    if (witnesses.length) {
      await pause(channel, 1000);
      await channel.send(testimonies.some(t => t.role === 'testigo') ? 'testimonios de testigos recibidos ✍️' : 'nadie declaro nada al final, seguimos igual 🤷');
    }

    // ── 7. Interrogatorio a los abogados de AMBOS bandos: 2 rondas c/u ───
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
    await channel.send(contraResp?.text?.trim() || `la cosa esta reñida entre la defensa de ${targetMention} y el resto...`);

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
      `Estructura tu respuesta en EXACTAMENTE 4 partes separadas por la marca ${SECTION_DELIM} (sin numerarlas, sin titulos, cada parte de maximo 3 lineas):\n` +
      `1) Quien jugo a favor y quien en contra de ${targetMention}, y por que (segun lo que dijeron).\n` +
      `2) Si la defensa de ${targetMention} se sostuvo o no frente a todo eso.\n` +
      `3) Que tan cerrado o aplastante fue el resultado, con humor.\n` +
      `4) El veredicto final gracioso y liviano (tipo "culpable/inocente de [algo tierno/gracioso, ej: ser un migajero]"), sin sanciones reales, dejando claro que fue un juego. ${STYLE_RULES}`;

    const veredictoResp = await askAI([{ role: 'user', content: veredictoPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);

    if (!veredictoResp?.text) {
      await channel.send('se me trabo la cabeza armando el veredicto, probemos de nuevo en un rato 😅');
      return;
    }

    await sendInParts(channel, veredictoResp.text);
  } catch (err) {
    console.error('[funadorSession]', err.message);
    await channel.send('algo se rompio armando el juicio, quedo cancelado por ahora').catch(() => {});
  } finally {
    activeSessions.delete(channelId);
    pendingAnswers.delete(channelId);
  }
}

export default { startFunadorSession, isPendingFunadorAnswer };
