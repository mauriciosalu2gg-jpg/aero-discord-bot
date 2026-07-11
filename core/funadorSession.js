// core/funadorSession.js
// "Juicio" en broma, tipo juego de mesa entre amigos, narrado en muchas
// etapas reales (nunca un bloque de texto de una sola vez). NUNCA arranca
// sin permiso: primero le pregunta al acusado si quiere jugar, despues
// invita (sin presionar) a que otros se sumen como "testigos" si quieren,
// y solo si el acusado dijo que si se sigue. Una vez adentro hay un
// interrogatorio de verdad (varias rondas, esperando respuestas reales en
// el chat) tanto al acusado como a los testigos, y recien al final el bot
// delibera y decide un "ganador" (acusado vs testigos) segun que tan bien
// se sostuvo cada lado. Todo usa unicamente el historial visible del canal
// + lo que la gente escribio en esta misma sesion -- nada de vigilancia
// oculta ni evidencia guardada aparte.
import { askAI } from '../services/aiManager.js';
import { getMemory } from './memory.js';
import { humanizedTyping } from './typingDelay.js';

const CONSENT_TIMEOUT_MS = 2 * 60 * 1000;   // 2 min para que el acusado consienta
const WITNESS_WINDOW_MS = 45 * 1000;        // 45s abiertos para sumarse como testigo
const ANSWER_TIMEOUT_MS = 75 * 1000;        // 75s por cada respuesta esperada en una ronda

const SECTION_DELIM = '|||SECCION|||';

// channelId -> true mientras hay una sesion en curso (evita solapar bits)
const activeSessions = new Set();

function buildConsentPrompt(initiator, targetMention) {
  return (
    `${targetMention}, ${initiator} quiere armarte un "juicio" de mentira, todo en joda 🎭\n` +
    `Nada de esto es en serio, es solo un bit divertido con lo que ya se hablo en el canal.\n` +
    `¿Te copa jugar? Reacciona con ✅ si queres, o con ❌ si mejor no.`
  );
}

async function pause(channel, ms = 1500) {
  await humanizedTyping(channel, Math.min(ms, 8000)).catch(() => {});
}

// Manda un mensaje/pregunta y espera UNA respuesta real de esa persona en
// el canal (o null si no contesto a tiempo). No bloquea para siempre.
async function askAndWait(channel, userId, question) {
  await pause(channel, 1300);
  await channel.send(question);
  const collected = await channel
    .awaitMessages({ filter: m => m.author.id === userId, max: 1, time: ANSWER_TIMEOUT_MS, errors: ['time'] })
    .catch(() => null);
  return collected?.first()?.content?.trim() || null;
}

// Le pide a la IA una repregunta corta y picante (pero amistosa) basada en
// lo que la persona acaba de responder, para que el interrogatorio se
// sienta vivo en vez de siempre la misma pregunta generica.
async function generateFollowUp(guild, channelName, role, previousAnswer, targetName) {
  const prompt =
    `Estas narrando un juicio de mentira, tipo juego, contra ${targetName}. ` +
    `El/la ${role} acaba de responder esto: "${previousAnswer}". ` +
    `Escribi UNA sola repregunta corta (maximo 2 lineas), tono comedia amistosa tipo abogado de reality show, ` +
    `nunca cruel ni insultos reales, que lo/la haga elaborar mas o lo/la ponga en aprietos de forma graciosa. ` +
    `Responde SOLO con la pregunta, nada mas.`;

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

export async function startFunadorSession(interaction, targetUser) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const channelId = channel.id;

  if (activeSessions.has(channelId)) {
    await interaction.reply({ content: 'ya hay un juicio en curso en este canal, esperemos a que termine 😅', ephemeral: true });
    return;
  }
  if (targetUser.bot) {
    await interaction.reply({ content: 'no le puedo hacer un juicio a otro bot, jaja', ephemeral: true });
    return;
  }

  activeSessions.add(channelId);
  await interaction.reply({ content: `dale, le pregunto a ${targetUser} si quiere jugar 👀`, ephemeral: false });

  try {
    // ── 1. Consentimiento del acusado, obligatorio ──────────────────────
    const consentMsg = await channel.send(buildConsentPrompt(interaction.user, `<@${targetUser.id}>`));
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
      await channel.send(`bueno, quedamos ahi entonces, no hay juicio 🤝 (${targetUser} no dijo que si o no contesto a tiempo)`);
      return;
    }

    // ── 2. Invitacion abierta a testigos, opcional ──────────────────────
    const witnessMsg = await channel.send(
      `${targetUser} dijo que si 🎉 el que quiera sumarse de testigo, que reaccione con 🙋 en los proximos 45s (opcional, nadie esta obligado).`
    );
    await witnessMsg.react('🙋');
    await new Promise(r => setTimeout(r, WITNESS_WINDOW_MS));
    const reactionUsers = witnessMsg.reactions.cache.get('🙋')
      ? await witnessMsg.reactions.cache.get('🙋').users.fetch().catch(() => new Map())
      : new Map();
    const witnesses = [...reactionUsers.values()].filter(u => !u.bot && u.id !== targetUser.id);

    const memory = await getMemory(channelId, guild?.id).catch(() => ({ messages: [] }));
    const recentText = (memory.messages || [])
      .slice(-25)
      .map(m => `${m.authorName || m.role}: ${m.content}`)
      .join('\n');

    // ── 3. Apertura + fiscalia inicial, narradas ────────────────────────
    await pause(channel, 1500);
    await channel.send(
      `⚖️ **Se abre la sesion.** Hoy tenemos en el banquillo a ${targetUser} por lo que se vino acumulando en el chat.` +
      (witnesses.length ? ` Contamos con ${witnesses.length} testigo(s): ${witnesses.map(w => `<@${w.id}>`).join(', ')}.` : ' No hay testigos anotados, va a ser mano a mano.')
    );

    const fiscaliaPrompt =
      `Estas narrando la apertura de la fiscalia en un juicio de mentira contra ${targetUser.username}, ` +
      `un juego que el/ella acepto jugar. Usa SOLO lo que aparece en este historial reciente del canal ` +
      `(no inventes acusaciones nuevas). Tono: comedia amistosa tipo reality show, nunca cruel, nunca insultos reales. ` +
      `Escribi 2-3 lineas presentando el "caso" contra ${targetUser.username}, citando algo puntual entre comillas si aplica.\n\n` +
      `Historial:\n${recentText || '(casi no hay historial, improvisa algo liviano sin inventar acusaciones concretas)'}`;
    const fiscaliaResp = await askAI([{ role: 'user', content: fiscaliaPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await pause(channel, 1500);
    await channel.send(fiscaliaResp?.text?.trim() || `La fiscalia dice que ${targetUser.username} tiene mucho que explicar hoy.`);

    // ── 4. Interrogatorio al acusado: 2 rondas reales ───────────────────
    await pause(channel, 1500);
    await channel.send(`🎤 Turno de la defensa. <@${targetUser.id}>, empecemos.`);

    const answer1 = await askAndWait(channel, targetUser.id, `<@${targetUser.id}>, ¿que pruebas o defensa tenes para este juicio? Tenes ${ANSWER_TIMEOUT_MS / 1000}s.`);
    let answer2 = null;
    if (answer1) {
      const followUp1 = await generateFollowUp(guild, channel.name, 'acusado', answer1, targetUser.username);
      answer2 = await askAndWait(channel, targetUser.id, `<@${targetUser.id}>, ${followUp1}`);
    } else {
      await pause(channel, 1200);
      await channel.send(`${targetUser.username} se quedo callado, no presento defensa... eso no pinta bien 👀`);
    }

    const defenseText = [answer1, answer2].filter(Boolean).join(' / ') || '(no presento defensa)';

    // ── 5. Interrogatorio a testigos (si hay): 2 rondas reales ──────────
    let testimonies = [];
    if (witnesses.length) {
      await pause(channel, 1500);
      await channel.send(`🎤 Turno de los testigos: ${witnesses.map(w => `<@${w.id}>`).join(', ')}, uno por uno.`);

      for (const witness of witnesses) {
        const t1 = await askAndWait(channel, witness.id, `<@${witness.id}>, ¿que tenes para declarar sobre ${targetUser.username}? Tenes ${ANSWER_TIMEOUT_MS / 1000}s.`);
        if (!t1) continue;
        const followUpW = await generateFollowUp(guild, channel.name, 'testigo', t1, targetUser.username);
        const t2 = await askAndWait(channel, witness.id, `<@${witness.id}>, ${followUpW}`);
        testimonies.push(`${witness.username}: ${[t1, t2].filter(Boolean).join(' / ')}`);
      }

      await pause(channel, 1200);
      await channel.send(testimonies.length ? 'testimonios recibidos ✍️' : 'nadie declaro nada al final, seguimos igual 🤷');
    }

    // ── 6. Contra-argumento narrado ──────────────────────────────────────
    await pause(channel, 1800);
    const contraPrompt =
      `Estas narrando el contra-argumento en un juicio de mentira contra ${targetUser.username}. ` +
      `Defensa presentada: ${defenseText}\n` +
      `Testimonios: ${testimonies.length ? testimonies.join(' | ') : '(sin testimonios)'}\n` +
      `Escribi 2-3 lineas comparando que tan bien se sostiene la defensa contra los testimonios (si hay), ` +
      `tono comedia amistosa, nunca cruel ni insultos reales.`;
    const contraResp = await askAI([{ role: 'user', content: contraPrompt }], 0, { guild, channelName: channel.name, swearingAllowed: false }).catch(() => null);
    await channel.send(contraResp?.text?.trim() || 'la cosa esta reñida entre la defensa y los testimonios...');

    // ── 7. Deliberacion + veredicto final (acusado vs testigos) ─────────
    await pause(channel, 1800);
    await channel.send('dejenme deliberar un toque... ⚖️');

    const veredictoPrompt =
      `Sos el juez de un juicio de mentira (juego que ${targetUser.username} acepto jugar). Con todo lo` +
      ` recopilado, decidi un "ganador": o convencio mas la defensa de ${targetUser.username}, o convencieron mas` +
      ` los testimonios en su contra (si no hubo testigos, evalua la defensa contra el historial nomas).\n\n` +
      `Defensa de ${targetUser.username}: ${defenseText}\n` +
      `Testimonios: ${testimonies.length ? testimonies.join(' | ') : '(sin testimonios)'}\n` +
      `Historial reciente del canal:\n${recentText || '(sin historial relevante)'}\n\n` +
      `Estructura tu respuesta en EXACTAMENTE 3 partes separadas por la marca ${SECTION_DELIM} (sin numerarlas, sin titulos):\n` +
      `1) Resumen de por que gano quien gano (defensa o testigos/acusacion), citando algo puntual si aplica.\n` +
      `2) Que tan cerrado o aplastante fue el resultado, con humor.\n` +
      `3) El veredicto final gracioso y liviano (tipo "culpable/inocente de [algo tierno/gracioso]", y quien "gano" el juicio), sin sanciones reales, dejando claro que fue un juego.`;

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
  }
}

export default { startFunadorSession };
