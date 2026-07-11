// core/funadorSession.js
// "Juicio" en broma, tipo juego de mesa entre amigos. NUNCA arranca sin
// permiso: primero le pregunta al acusado si quiere jugar, despues invita
// (sin presionar) a que otros se sumen como "testigos" si quieren, y solo
// si el acusado dijo que si se arma el veredicto final. Todo con tono
// amable, sin groserias, sin amenazas, cero vigilancia oculta: el
// "veredicto" usa unicamente lo que ya esta visible en el historial del
// canal (la misma memoria que ya usa el bot para responder).
import { askAI } from '../services/aiManager.js';
import { getMemory } from './memory.js';

const CONSENT_TIMEOUT_MS = 2 * 60 * 1000; // 2 min para que el acusado responda
const WITNESS_WINDOW_MS = 45 * 1000;      // 45s abiertos para sumarse como testigo

// channelId -> true mientras hay una sesion en curso (evita solapar bits)
const activeSessions = new Set();

function buildConsentPrompt(initiator, target) {
  return (
    `${target}, ${initiator} quiere armarte un "juicio" de mentira, todo en joda 🎭\n` +
    `Nada de esto es en serio, es solo un bit divertido con lo que ya se hablo en el canal.\n` +
    `¿Te copa jugar? Reacciona con ✅ si queres, o con ❌ si mejor no.`
  );
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
    // 1. Consentimiento del acusado, obligatorio.
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

    // 2. Invitacion abierta a testigos, opcional, nadie es arrastrado.
    const witnessMsg = await channel.send(
      `${targetUser} dijo que si 🎉 el que quiera sumarse de testigo, que reaccione con 🙋 en los proximos 45s (opcional, nadie esta obligado).`
    );
    await witnessMsg.react('🙋');

    await new Promise(r => setTimeout(r, WITNESS_WINDOW_MS));
    const reactionUsers = witnessMsg.reactions.cache.get('🙋')
      ? await witnessMsg.reactions.cache.get('🙋').users.fetch().catch(() => new Map())
      : new Map();
    const witnesses = [...reactionUsers.values()].filter(u => !u.bot && u.id !== targetUser.id);

    // 3. Veredicto: solo con lo que ya esta en el historial visible del canal.
    const memory = await getMemory(channelId, guild?.id).catch(() => ({ messages: [] }));
    const recentText = (memory.messages || [])
      .slice(-25)
      .map(m => `${m.authorName || m.role}: ${m.content}`)
      .join('\n');

    const witnessNote = witnesses.length
      ? `Testigos que se sumaron por su cuenta: ${witnesses.map(u => u.username).join(', ')}.`
      : 'Nadie se sumo de testigo, y esta bien igual.';

    const prompt =
      `Arma el "veredicto" del juicio de mentira contra ${targetUser.username}, ` +
      `usando SOLO lo que aparece en este historial reciente del canal (no inventes nada nuevo, ` +
      `no acuses de algo que no este ahi). Tono: comedia amistosa tipo programa de TV, nunca cruel, ` +
      `nunca insultos reales, dejando clarisimo todo el tiempo que es un juego que ${targetUser.username} ` +
      `acepto jugar. Podes usar **negrita** y citar frases cortas entre comillas. Cerra con un veredicto ` +
      `gracioso y liviano (tipo "culpable de [algo tierno/gracioso]"), nunca con sanciones reales. ` +
      `${witnessNote}\n\nHistorial:\n${recentText || '(no hay mucho historial todavia, improvisa algo liviano y gracioso sin inventar acusaciones concretas)'}`;

    const response = await askAI(
      [{ role: 'user', content: prompt }],
      0,
      { guild, channelName: channel.name, swearingAllowed: false }
    ).catch(() => null);

    if (response?.text) {
      await channel.send(response.text);
    } else {
      await channel.send('se me trabo la cabeza armando el veredicto, probemos de nuevo en un rato 😅');
    }
  } catch (err) {
    console.error('[funadorSession]', err.message);
    await channel.send('algo se rompio armando el juicio, quedo cancelado por ahora').catch(() => {});
  } finally {
    activeSessions.delete(channelId);
  }
}

export default { startFunadorSession };
