// core/funadorSession.js
// "Juicio" en broma, tipo juego de mesa entre amigos, narrado en etapas
// reales (no un bloque de texto de una sola vez). NUNCA arranca sin
// permiso: primero le pregunta al acusado si quiere jugar, despues invita
// (sin presionar) a que otros se sumen como "testigos" si quieren, y solo
// si el acusado dijo que si se sigue. Una vez adentro, el bot le pide de
// verdad su defensa/pruebas al acusado y espera su respuesta real en el
// chat, despues le pide lo mismo a los testigos que se sumaron, y recien
// con eso arma el veredicto -- que ademas se manda en varias partes con
// pausas, como si se narrara en vivo. El "veredicto" usa unicamente lo que
// ya esta visible en el historial del canal + lo que la gente escribio en
// esta misma sesion (nada de vigilancia oculta ni evidencia guardada aparte).
import { askAI } from '../services/aiManager.js';
import { getMemory } from './memory.js';
import { humanizedTyping } from './typingDelay.js';

const CONSENT_TIMEOUT_MS = 2 * 60 * 1000;   // 2 min para que el acusado consienta
const WITNESS_WINDOW_MS = 45 * 1000;        // 45s abiertos para sumarse como testigo
const DEFENSE_TIMEOUT_MS = 90 * 1000;       // 90s para que el acusado presente su defensa
const TESTIMONY_TIMEOUT_MS = 75 * 1000;     // 75s para que los testigos declaren

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

async function pause(channel, ms = 1400) {
  await humanizedTyping(channel, Math.min(ms, 8000)).catch(() => {});
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

    // ── 3. Apertura del juicio, narrada ─────────────────────────────────
    await pause(channel, 1500);
    await channel.send(
      `⚖️ **Se abre la sesion.** Hoy tenemos en el banquillo a ${targetUser} por las acusaciones que se vinieron acumulando en el chat.` +
      (witnesses.length ? ` Contamos con ${witnesses.length} testigo(s): ${witnesses.map(w => `<@${w.id}>`).join(', ')}.` : ' No hay testigos anotados, va a ser mano a mano.')
    );

    // ── 4. Se le pide la defensa al acusado, y se espera de verdad ──────
    await pause(channel, 1500);
    await channel.send(`<@${targetUser.id}>, decime: ¿que pruebas o defensa tenes para este juicio? Tenes 90 segundos, contame en el chat 🎤`);

    const defenseCollected = await channel
      .awaitMessages({
        filter: m => m.author.id === targetUser.id,
        max: 1,
        time: DEFENSE_TIMEOUT_MS,
        errors: ['time'],
      })
      .catch(() => null);

    const defenseText = defenseCollected?.first()?.content?.trim();

    await pause(channel, 1200);
    if (defenseText) {
      await channel.send(`tomo nota de tu defensa, ${targetUser.username} 📝`);
    } else {
      await channel.send(`${targetUser.username} se quedo callado, no presento defensa... eso no pinta bien 👀`);
    }

    // ── 5. Se les pide testimonio a los testigos (si hay), y se espera ──
    let testimonies = [];
    if (witnesses.length) {
      await pause(channel, 1200);
      await channel.send(
        `Testigos (${witnesses.map(w => `<@${w.id}>`).join(', ')}): ¿que tienen para declarar? Tienen 75 segundos entre todos, uno por uno en el chat 🎤`
      );

      const witnessIds = new Set(witnesses.map(w => w.id));
      const testimonyCollected = await channel
        .awaitMessages({
          filter: m => witnessIds.has(m.author.id),
          max: witnesses.length,
          time: TESTIMONY_TIMEOUT_MS,
          errors: [],
        })
        .catch(() => null);

      testimonies = testimonyCollected
        ? [...testimonyCollected.values()].map(m => `${m.author.username}: ${m.content}`)
        : [];

      await pause(channel, 1000);
      await channel.send(testimonies.length ? 'testimonios recibidos ✍️' : 'nadie declaro nada, seguimos igual 🤷');
    }

    // ── 6. Veredicto: se arma con lo que ya esta visible + lo dicho aca ──
    await pause(channel, 1800);
    await channel.send('dejenme deliberar un toque... ⚖️');

    const memory = await getMemory(channelId, guild?.id).catch(() => ({ messages: [] }));
    const recentText = (memory.messages || [])
      .slice(-25)
      .map(m => `${m.authorName || m.role}: ${m.content}`)
      .join('\n');

    const prompt =
      `Estas narrando el veredicto de un "juicio" de mentira contra ${targetUser.username}, ` +
      `un juego que el/ella acepto jugar. Usa SOLO lo que aparece en el historial del canal y lo que ` +
      `se declaro en esta sesion (no inventes acusaciones nuevas que no esten ahi). Tono: comedia amistosa ` +
      `tipo reality show, nunca cruel, nunca insultos reales.\n\n` +
      `Defensa presentada por ${targetUser.username}: ${defenseText || '(no presento defensa)'}\n\n` +
      `Testimonios: ${testimonies.length ? testimonies.join(' | ') : '(sin testimonios)'}\n\n` +
      `Historial reciente del canal:\n${recentText || '(casi no hay historial, improvisa algo liviano sin inventar acusaciones concretas)'}\n\n` +
      `Estructura tu respuesta en EXACTAMENTE 3 partes separadas por la marca ${SECTION_DELIM} (sin numerarlas, sin titulos):\n` +
      `1) Un resumen corto de los argumentos en contra, citando cosas puntuales entre comillas si aplica.\n` +
      `2) Como se sostiene (o no) la defensa/testimonios que se presentaron recien.\n` +
      `3) El veredicto final gracioso y liviano (tipo "culpable de [algo tierno/gracioso]"), sin sanciones reales, dejando claro que fue un juego.`;

    const response = await askAI(
      [{ role: 'user', content: prompt }],
      0,
      { guild, channelName: channel.name, swearingAllowed: false }
    ).catch(() => null);

    if (!response?.text) {
      await channel.send('se me trabo la cabeza armando el veredicto, probemos de nuevo en un rato 😅');
      return;
    }

    const parts = response.text.split(SECTION_DELIM).map(p => p.trim()).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      await pause(channel, 1800 + Math.random() * 1200);
      await channel.send(parts[i]);
    }
  } catch (err) {
    console.error('[funadorSession]', err.message);
    await channel.send('algo se rompio armando el juicio, quedo cancelado por ahora').catch(() => {});
  } finally {
    activeSessions.delete(channelId);
  }
}

export default { startFunadorSession };
