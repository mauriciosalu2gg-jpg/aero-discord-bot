import { EmbedBuilder } from 'discord.js';
import { askAI } from '../../services/aiManager.js';
import { getFlags } from '../../core/behaviorFlags.js';
import { formatProfileForPrompt, getUserMemoryConfig, setUserMemoryConfig } from '../../core/memory/config.js';
import { getUserStats } from '../../core/moderation/index.js';
import { processAttachments, processUrls } from '../../services/documentReader.js';
import { webSearch } from '../../core/webSearch.js';
import { getActiveProvider, getAllSnapshots } from '../../services/ai/providerHealth.js';
import secrets from '../../secrets.js';
import { isAltoMando } from './aiHandler.js';

// --- HELPERS PARA HERRAMIENTAS (ex secretoHandler) ---
const PROVIDER_LABELS = {
  groq: 'Groq',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

function providerAvailable(name) {
  return secrets.getAvailableProviders().some(p => p.name === name);
}

function botStyle(interaction) {
  const flags = getFlags(interaction.guildId);
  return (flags.botPersonality || 'asistente').trim() || 'asistente';
}

function personalityStyle(identity) {
  switch ((identity || '').toLowerCase()) {
    case 'chatgpt': return 'Responde con claridad, equilibrio, estructura útil y tono tipo asistente generalista avanzado.';
    case 'gemini': return 'Responde con un estilo ágil, analítico y multimodal en espíritu, con respuestas concisas pero completas.';
    case 'claude': return 'Responde con tono cálido, reflexivo, prudente y muy bien estructurado.';
    case 'copilot': return 'Responde como un asistente de desarrollo práctico, directo y orientado a ejecución.';
    case 'perplexity': return 'Responde como un asistente de investigación, muy orientado a datos, matices y síntesis.';
    case 'mistral': return 'Responde con rapidez, claridad y estilo compacto, sin perder precisión.';
    default: return 'Responde con un estilo de asistente útil, natural y profesional.';
  }
}

function providerInstruction(provider, style, isSimulation = false) {
  const providerLabel = PROVIDER_LABELS[provider] || provider;
  const parts = [`Proveedor elegido para esta consulta: ${providerLabel}.`, `Personalidad base: ${personalityStyle(style)}`];
  if (isSimulation) {
    parts.push('Simula el estilo del asistente indicado, pero no afirmes ser ese producto ni inventes acceso interno.');
    parts.push('No digas "soy ChatGPT/Gemini/Claude" como identidad real; solo imita el modo de responder.');
  }
  return parts.join('\n');
}

async function analyzeText(interaction, task, inputText, intent = 'chat', providerOverride = undefined, systemExtra = '') {
  await interaction.deferReply().catch(() => {});
  try {
    const personality = botStyle(interaction);
    const prompt = [`Tarea secreta: ${task}.`, `Personalidad activa: "${personality}". Mantenla de forma consistente.`, systemExtra || 'Responde en español, sin rodeos y sin explicar el proceso interno.', inputText].join('\n');
    const response = await askAI([{ role: 'user', content: prompt }], 0, {
      guild: interaction.guild,
      channelName: interaction.channel?.name,
      swearingAllowed: getFlags(interaction.guildId).swearing,
      botPersonality: personality,
      providerOverride,
      intent,
    });
    await interaction.followUp({ content: response.text });
  } catch (err) {
    console.error(`[novarito:${interaction.commandName}]`, err);
    await interaction.followUp({ content: '❌ No pude ejecutar esa capacidad con el proveedor seleccionado.' }).catch(() => {});
  }
}

async function readAttachment(attachment) {
  if (!attachment) return '';
  const fileMap = new Map([[attachment.id, attachment]]);
  return processAttachments(fileMap);
}

// --- HELPERS PARA DIVERSION Y PUBLICO (ex publicCommands) ---
function getPublicContext(interaction) {
  const guildId = interaction.guildId;
  const flags = getFlags(guildId);
  return {
    guildId,
    flags,
    botPersonality: (flags.botPersonality || 'asistente').trim() || 'asistente',
    guild: interaction.guild,
    channelName: interaction.channel?.name,
    userId: interaction.user.id,
    userName: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
  };
}

function personalityLine(botPersonality) {
  if (botPersonality.toLowerCase() === 'asistente') return 'Mantén un tono cercano, claro y útil.';
  return `Tu personalidad activa es "${botPersonality}". Respeta ese tono de forma consistente en toda la respuesta.`;
}

async function buildPublicAIExtra(interaction) {
  const context = getPublicContext(interaction);
  const userConfig = await getUserMemoryConfig(context.userId);
  return {
    ...context,
    userProfile: formatProfileForPrompt(userConfig.profile),
    respectfulOnly: context.flags.respectfulOnly,
    securityMode: context.flags.securityMode,
    swearingAllowed: context.flags.swearing,
  };
}

async function askPublicAI(interaction, prompt, intent = 'chat') {
  const extra = await buildPublicAIExtra(interaction);
  return askAI([{ role: 'user', content: prompt }], 0, { ...extra, intent });
}

async function replyWithAI(interaction, prompt, { intent = 'chat', ephemeral = false } = {}) {
  await interaction.deferReply({ ephemeral }).catch(() => {});
  try {
    const response = await askPublicAI(interaction, prompt, intent);
    await interaction.followUp({ content: response.text });
  } catch (err) {
    console.error(`[public:${interaction.commandName}]`, err);
    await interaction.followUp({ content: '❌ Hubo un error al generar la respuesta de la IA.', ephemeral: true }).catch(() => {});
  }
}

function buildPromptBase(interaction, lead) {
  const { botPersonality } = getPublicContext(interaction);
  return [lead, personalityLine(botPersonality), 'Responde en español, de forma natural, ingeniosa y sin explicar tu proceso.'].join('\n');
}

// ==========================================
// MAIN HANDLER
// ==========================================
export async function handleNovaritoCommand(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const flags = getFlags(interaction.guildId);

  // 1. AYUDA
  if (!group && sub === 'ayuda') {
    const context = getPublicContext(interaction);
    const embed = new EmbedBuilder()
      .setColor(0x4f9cf9)
      .setTitle('Manual de Comandos — Novarito Bot')
      .setDescription('Lista limpia y compacta de todos mis comandos unificados.')
      .addFields(
        { name: '🎉 Diversión (Público)', value: '`/novarito diversion ...` (opciones: `pregunta`, `datorandom`, `roast`, `chiste`, `consejo`, `cumplido`, `animo`, `trivia`, `versus`, `adivina`, `horoscopo`, `poema`)' },
        { name: '👤 Perfil y Memoria (Público)', value: '`/novarito usuario perfil` — Muestra tu perfil.\n`/novarito usuario configurar` — Edita tus preferencias.' },
        { name: '⚙️ AI Control Panel (Alto Mando)', value: '`/ai ...` (opciones: `chat`, `proveedor`, `estado`, `imaginar`, `limpiar_memoria`, `modo_memoria`, `nombre_y_pronombre`, `editar_personalidad`, `ver_personalidad`, `pts_reset`)' },
        { name: '🛡️ Automoderación (Alto Mando)', value: '`/moderacion ...` (opciones: `estado`, `guardian`, `karma`, `permisos_link`)' },
        { name: '🔮 Herramientas AI (Alto Mando)', value: '`/novarito herramientas ...` (opciones: `buscar`, `investigar`, `archivo`, `enlace`, `resumen`, `reescribir`, `prompt`, `detectar`, `hablar`, `simular`, `comparar`, `proveedores`)' }
      )
      .setFooter({ text: `Personalidad activa del bot: ${context.botPersonality}` });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 2. GRUPO: HERRAMIENTAS (Alto Mando)
  if (group === 'herramientas') {
    if (!isAltoMando(interaction)) {
      return interaction.reply({ content: '❌ No tienes permisos de **Alto Mando** para usar las herramientas avanzadas de Novarito.', ephemeral: true });
    }

    if (sub === 'buscar') {
      const query = interaction.options.getString('query');
      await interaction.deferReply().catch(() => {});
      try {
        const context = await webSearch(query).catch(() => null);
        const queryPrompt = [`Tarea web: busca y responde con contexto fresco.`, `Consulta: ${query}`, context ? `Contexto fresco de web: ${context}` : 'No hubo contexto web fresco disponible.', 'No menciones que usaste herramientas.'].join('\n');
        const response = await askAI([{ role: 'user', content: queryPrompt }], 0, { guild: interaction.guild, channelName: interaction.channel?.name, swearingAllowed: flags.swearing, botPersonality: flags.botPersonality || 'asistente', webContext: context, intent: 'chat' });
        return interaction.followUp({ content: response.text });
      } catch (err) { return interaction.followUp({ content: '❌ Ocurrió un error al buscar en la web.' }); }
    }
    
    if (sub === 'investigar') {
      const tema = interaction.options.getString('tema');
      await interaction.deferReply().catch(() => {});
      try {
        const context = await webSearch(tema).catch(() => null);
        const queryPrompt = [`Tarea web: investiga y sintetiza hallazgos de manera analítica.`, `Tema: ${tema}`, context ? `Contexto fresco de web: ${context}` : 'No hubo contexto web fresco disponible.'].join('\n');
        const response = await askAI([{ role: 'user', content: queryPrompt }], 0, { guild: interaction.guild, channelName: interaction.channel?.name, swearingAllowed: flags.swearing, botPersonality: flags.botPersonality || 'asistente', webContext: context, intent: 'chat' });
        return interaction.followUp({ content: response.text });
      } catch (err) { return interaction.followUp({ content: '❌ Ocurrió un error al investigar.' }); }
    }

    if (sub === 'archivo') {
      const archivo = interaction.options.getAttachment('documento');
      const text = await readAttachment(archivo);
      return analyzeText(interaction, `lee este archivo y explica su contenido de forma clara: ${archivo.name}`, text || `No pude extraer texto de ${archivo.name}.`, 'summary');
    }

    if (sub === 'enlace') {
      const url = interaction.options.getString('url');
      const extracted = await processUrls(url).catch(() => null);
      return analyzeText(interaction, 'lee el enlace y devuelve un resumen útil con puntos clave', extracted || `Contenido del enlace:\n${url}`, 'summary');
    }

    if (sub === 'resumen') {
      const texto = interaction.options.getString('texto');
      const formato = interaction.options.getString('formato');
      return analyzeText(interaction, `resume el texto ${formato ? 'en formato ' + formato : 'en puntos claros y cortos'}`, `Texto a resumir:\n${texto}`, 'summary');
    }

    if (sub === 'traducir') {
      const texto = interaction.options.getString('texto');
      const idioma = interaction.options.getString('idioma');
      return analyzeText(interaction, `traduce el siguiente texto al ${idioma}`, `Texto original:\n${texto}`, 'chat');
    }

    if (sub === 'reescribir') {
      const texto = interaction.options.getString('texto');
      const tono = interaction.options.getString('tono') || 'claro';
      return analyzeText(interaction, `reescribe el texto con un tono ${tono}`, `Texto original:\n${texto}`, 'chat');
    }

    if (sub === 'detectar') {
      const texto = interaction.options.getString('texto');
      return analyzeText(interaction, 'detecta intención, tono, riesgos y posibles dobles sentidos del texto', `Texto:\n${texto}`, 'summary');
    }

    if (sub === 'prompt') {
      const idea = interaction.options.getString('idea');
      return analyzeText(interaction, 'convierte la idea en un prompt más fuerte, útil y preciso', `Idea base:\n${idea}`, 'chat');
    }

    if (sub === 'hablar') {
      const texto = interaction.options.getString('texto');
      const proveedor = interaction.options.getString('proveedor');
      const finalPrompt = ['Responde al siguiente mensaje como un asistente de IA competente y natural.', `Mensaje del usuario: ${texto}`].join('\n');
      await interaction.deferReply().catch(() => {});
      try {
        const response = await askAI([{ role: 'user', content: finalPrompt }], 0, { guild: interaction.guild, channelName: interaction.channel?.name, swearingAllowed: flags.swearing, botPersonality: flags.botPersonality || 'asistente', providerOverride: proveedor, intent: 'chat', systemExtra: providerInstruction(proveedor, 'normal', false) });
        return interaction.followUp({ content: response.text });
      } catch (err) { return interaction.followUp({ content: '❌ No pude conectar con el proveedor para hablar.' }); }
    }

    if (sub === 'simular') {
      const texto = interaction.options.getString('texto');
      const identidad = interaction.options.getString('identidad');
      const finalPrompt = [`Simula el estilo de ${identidad} para responder el mensaje.`, `Mensaje del usuario: ${texto}`, 'Mantén la respuesta útil, clara y sin fingir acceso real al producto.'].join('\n');
      await interaction.deferReply().catch(() => {});
      try {
        const response = await askAI([{ role: 'user', content: finalPrompt }], 0, { guild: interaction.guild, channelName: interaction.channel?.name, swearingAllowed: flags.swearing, botPersonality: flags.botPersonality || 'asistente', intent: 'chat', systemExtra: providerInstruction('auto', identidad, true) });
        return interaction.followUp({ content: response.text });
      } catch (err) { return interaction.followUp({ content: '❌ No pude simular el estilo indicado.' }); }
    }

    if (sub === 'comparar') {
      const texto = interaction.options.getString('texto');
      const proveedorB = interaction.options.getString('proveedor_b');
      const proveedorA = 'auto'; // Usamos el auto para A, el override para B
      await interaction.deferReply().catch(() => {});
      try {
        const prompt = `Compara de forma útil y breve esta petición: ${texto}`;
        const common = { guild: interaction.guild, channelName: interaction.channel?.name, swearingAllowed: flags.swearing, botPersonality: flags.botPersonality || 'asistente', intent: 'chat' };
        const [a, b] = await Promise.all([
          askAI([{ role: 'user', content: prompt }], 0, { ...common }),
          askAI([{ role: 'user', content: prompt }], 0, { ...common, providerOverride: proveedorB, systemExtra: providerInstruction(proveedorB, 'normal', false) }),
        ]);
        const embed = new EmbedBuilder().setTitle('Comparación de Proveedores de IA').setColor(0x4f9cf9).addFields({ name: 'Principal (Auto)', value: a.text.slice(0, 1000) || 'Sin respuesta', inline: false }, { name: PROVIDER_LABELS[proveedorB] || proveedorB, value: b.text.slice(0, 1000) || 'Sin respuesta', inline: false });
        return interaction.followUp({ embeds: [embed] });
      } catch (err) { return interaction.followUp({ content: '❌ Error al realizar la comparación de IA.' }); }
    }

    if (sub === 'proveedores') {
      const active = getActiveProvider();
      const snapshots = getAllSnapshots(secrets.getAvailableProviders().map(p => p.name));
      const embed = new EmbedBuilder().setTitle('Salud de los Proveedores de IA').setColor(0x2ecc71).setDescription(`Proveedor activo: **${active ? `${active.name}/${active.model}` : 'ninguno'}**`).addFields(...snapshots.map(s => ({ name: PROVIDER_LABELS[s.name] || s.name, value: `Estado: \`${s.status}\`\nLatencia: \`${s.averageLatencyMs || 'N/A'} ms\`\nErrores: \`${s.errors}\``, inline: true })));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // 3. GRUPO: DIVERSION (Público)
  if (group === 'diversion') {
    if (sub === 'pregunta') return replyWithAI(interaction, buildPromptBase(interaction, `Responde a esta pregunta:\n${interaction.options.getString('texto')}`));
    if (sub === 'datorandom') return replyWithAI(interaction, buildPromptBase(interaction, 'Dame un dato curioso, sorprendente y breve. Una sola respuesta corta.'));
    if (sub === 'roast') {
      const roast = interaction.options.getUser('usuario');
      const targetName = roast.globalName || roast.displayName || roast.username;
      return replyWithAI(interaction, buildPromptBase(interaction, `Haz un roast original para <@${roast.id}> (${targetName}). Ingenioso, sutil, máximo dos frases.`));
    }
    if (sub === 'chiste') {
      const tema = interaction.options.getString('tema');
      return replyWithAI(interaction, buildPromptBase(interaction, `Crea un chiste corto y original. ${tema ? `Tema: ${tema}` : 'Tema libre.'}`));
    }
    if (sub === 'consejo') {
      const tema = interaction.options.getString('tema');
      return replyWithAI(interaction, buildPromptBase(interaction, `Dame un consejo práctico y breve. ${tema ? `Tema: ${tema}` : 'Para la vida diaria.'}`));
    }
    if (sub === 'cumplido') {
      const user = interaction.options.getUser('usuario');
      const targetName = user.globalName || user.displayName || user.username;
      return replyWithAI(interaction, buildPromptBase(interaction, `Escribe un cumplido original, creativo y amigable para <@${user.id}> (${targetName}).`));
    }
    if (sub === 'animo') {
      const animo = interaction.options.getUser('usuario');
      if(animo) {
        const targetName = animo.globalName || animo.displayName || animo.username;
        return replyWithAI(interaction, buildPromptBase(interaction, `Escribe un mensaje breve, alentador y humano para animar a <@${animo.id}> (${targetName}).`));
      } else {
        return replyWithAI(interaction, buildPromptBase(interaction, `Escribe un mensaje breve, alentador y humano de ánimo general para la vida.`));
      }
    }
    if (sub === 'trivia') {
      const cat = interaction.options.getString('categoria');
      return replyWithAI(interaction, buildPromptBase(interaction, `Genera una trivia o pregunta de conocimiento interesante y breve. ${cat ? `Categoría: ${cat}` : ''}`));
    }
    if (sub === 'versus') {
      const user = interaction.options.getUser('usuario');
      return replyWithAI(interaction, buildPromptBase(interaction, `Haz un versus cómico y sano comparando mis virtudes y las de <@${user.id}> con humor. Termina con un veredicto.`));
    }
    if (sub === 'adivina') {
      const p = interaction.options.getString('pregunta');
      return replyWithAI(interaction, buildPromptBase(interaction, `Actúa como una bola 8 mágica e ingeniosa. Responde a sí/no: "${p}". Muy corto.`));
    }
    if (sub === 'horoscopo') {
      const s = interaction.options.getString('signo');
      return replyWithAI(interaction, buildPromptBase(interaction, `Predice el horóscopo del zodiaco para el signo: "${s}". Divertido y misterioso. Máximo dos frases.`));
    }
    if (sub === 'poema') {
      const tema = interaction.options.getString('tema');
      return replyWithAI(interaction, buildPromptBase(interaction, `Escribe un poema corto de una estrofa. ${tema ? `Tema: ${tema}` : 'Libre.'}`));
    }
  }

  // 4. GRUPO: USUARIO (Perfil y Preferencias)
  if (group === 'usuario') {
    if (sub === 'perfil') {
      const userConfig = await getUserMemoryConfig(interaction.user.id);
      const profile = userConfig.profile || {};
      let stats = { points: 0, goodPoints: 0 };
      if (interaction.guildId) stats = await getUserStats(interaction.guildId, interaction.user.id).catch(() => ({ points: 0, goodPoints: 0 }));
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`Perfil de ${interaction.user.username}`)
        .setDescription('Tus configuraciones de memoria personalizadas en Novarito:')
        .addFields(
          { name: '👤 Nombre preferido', value: profile.preferredName || '*No configurado*', inline: true },
          { name: '✨ Pronombres', value: profile.pronouns || '*No configurado*', inline: true },
          { name: '⚖️ Historial', value: `Puntos Malos: **${stats.points}**/100\nKarma (Favor): **${stats.goodPoints}**`, inline: true },
          { name: '🎭 Personalidad del bot', value: `\`${flags.botPersonality || 'asistente'}\``, inline: true },
          { name: '🧠 Modo de memoria', value: `\`${userConfig.mode || 'local'}\``, inline: true },
          { name: '📝 Estilo de respuesta', value: profile.responseStyle || '*No configurado*', inline: false },
          { name: '❤️ Preferencias/Gustos', value: profile.preferences || '*No configurado*', inline: false },
          { name: '⚙️ Instrucciones especiales', value: profile.instructions || '*No configurado*', inline: false },
        )
        .setFooter({ text: 'Usa /novarito usuario configurar para cambiar estos datos.' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'configurar') {
      const config = await getUserMemoryConfig(interaction.user.id);
      const profile = { ...(config.profile || {}) };
      let changes = [];

      const n = interaction.options.getString('nombre');
      const p = interaction.options.getString('pronombres');
      const g = interaction.options.getString('gustos');
      const e = interaction.options.getString('estilo');
      const i = interaction.options.getString('instrucciones');
      const h = interaction.options.getString('historial');

      if (n !== null) { profile.preferredName = n.trim(); changes.push(`Nombre preferido: **${n.trim()}**`); }
      if (p !== null) { profile.pronouns = p.trim(); changes.push(`Pronombres: **${p.trim()}**`); }
      if (g !== null) { profile.preferences = g.trim(); changes.push('Preferencias guardadas'); }
      if (e !== null) { profile.responseStyle = e.trim(); changes.push('Estilo de respuesta guardado'); }
      if (i !== null) { profile.instructions = i.trim(); changes.push('Instrucciones guardadas'); }
      if (h !== null) { profile.importantHistory = h.trim(); changes.push('Historial guardado'); }

      if (changes.length === 0) return interaction.reply({ content: '❌ Selecciona al menos un campo para actualizar.', ephemeral: true });
      config.profile = profile;
      await setUserMemoryConfig(interaction.user.id, config);
      return interaction.reply({ content: `✅ Perfil actualizado:\n• ${changes.join('\n• ')}`, ephemeral: true });
    }

    if (sub === 'limpiar') {
      const config = await getUserMemoryConfig(interaction.user.id);
      config.profile = { preferredName: '', pronouns: '', preferences: '', responseStyle: '', instructions: '', importantHistory: '' };
      await setUserMemoryConfig(interaction.user.id, config);
      return interaction.reply({ content: '✅ Tu perfil y preferencias han sido borrados por completo.', ephemeral: true });
    }
  }

}

export default { handleNovaritoCommand };
