// interactions/commandDefinitions.js
// Un solo slash command raiz: /bot
// Todo lo demas vive como subcommand group + subcommand para que Discord
// no muestre muchos comandos base separados.
import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Comando principal del bot')
    .addSubcommandGroup(group => group
      .setName('config')
      .setDescription('Config general del bot')
      .addSubcommand(sc => sc.setName('calladito').setDescription('Apaga groserias y datos curiosos autonomos'))
      .addSubcommand(sc => sc.setName('hablar').setDescription('Vuelve al modo normal'))
      .addSubcommand(sc => sc
        .setName('forcetalk')
        .setDescription('Hace que el bot responda sin mencion')
        .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivado').setRequired(true)))
      .addSubcommand(sc => sc
        .setName('seguridad')
        .setDescription('Activa o desactiva el modo amable/seguro')
        .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivado').setRequired(true)))
      .addSubcommand(sc => sc
        .setName('ambiente')
        .setDescription('Activa o desactiva comentarios espontaneos')
        .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivado').setRequired(true)))
      .addSubcommand(sc => sc
        .setName('groserias')
        .setDescription('Activa o desactiva groserias')
        .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivado').setRequired(true)))
      .addSubcommand(sc => sc
        .setName('datos')
        .setDescription('Activa o desactiva datos curiosos autonomos')
        .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivado').setRequired(true))))
    .addSubcommandGroup(group => group
      .setName('ai')
      .setDescription('Estado y diagnostico de la IA del bot')
      .addSubcommand(sc => sc.setName('status').setDescription('Muestra compania/modelo actual y tokens gastados'))
      .addSubcommand(sc => sc.setName('providers').setDescription('Muestra el estado detallado de cada proveedor configurado'))
      .addSubcommand(sc => sc
        .setName('force')
        .setDescription('Fuerza un proveedor de IA especifico (solo Lara/Alero)')
        .addStringOption(opt => opt
          .setName('proveedor')
          .setDescription('Proveedor a forzar, o "auto" para volver a la rotacion normal')
          .setRequired(true)
          .addChoices(
            { name: 'Auto (rotacion normal)', value: 'auto' },
            { name: 'OpenRouter', value: 'openrouter' },
            { name: 'Groq', value: 'groq' },
            { name: 'Cerebras', value: 'cerebras' },
            { name: 'Mistral', value: 'mistral' },
            { name: 'Google Gemini', value: 'gemini' },
            { name: 'Cohere', value: 'cohere' },
            { name: 'OpenAI', value: 'openai' },
            { name: 'Anthropic (Claude)', value: 'anthropic' },
            { name: 'Hugging Face', value: 'huggingface' },
          ))))
    .addSubcommandGroup(group => group
      .setName('moderation')
      .setDescription('Moderacion automatica')
      .addSubcommand(sc => sc.setName('activate').setDescription('Activa moderacion automatica'))
      .addSubcommand(sc => sc.setName('deactivate').setDescription('Desactiva moderacion automatica'))
      .addSubcommand(sc => sc.setName('status').setDescription('Muestra si la moderacion automatica esta activa'))
      .addSubcommand(sc => sc
        .setName('reset')
        .setDescription('Reinicia los strikes de un usuario')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuario al que se le limpian los strikes').setRequired(true))))
    .addSubcommandGroup(group => group
      .setName('funador')
      .setDescription('Juicios de mentira y objeciones')
      .addSubcommand(sc => sc.setName('activate').setDescription('Habilita el modo funador en este servidor'))
      .addSubcommand(sc => sc.setName('deactivate').setDescription('Deshabilita el modo funador'))
      .addSubcommand(sc => sc
        .setName('start')
        .setDescription('Arranca un juicio en broma, pidiendo permiso al acusado primero')
        .addUserOption(opt => opt.setName('objetivo').setDescription('A quien le vamos a hacer el juicio de mentira').setRequired(true))
        .addStringOption(opt => opt.setName('razon').setDescription('De que se le acusa o contexto del juicio').setRequired(false)))
      .addSubcommand(sc => sc
        .setName('objecion')
        .setDescription('Solo abogados del juicio activo pueden usarla')
        .addStringOption(opt => opt.setName('motivo').setDescription('Por que estas objetando (opcional, corto)').setRequired(false))))
    .addSubcommandGroup(group => group
      .setName('memory')
      .setDescription('Gestion de memoria persistente')
      .addSubcommand(sc => sc.setName('channel').setDescription('Resetea solo este canal'))
      .addSubcommand(sc => sc.setName('server').setDescription('Resetea todo este servidor'))
      .addSubcommand(sc => sc.setName('all').setDescription('Resetea TODOS los servidores (solo Lara)')))
    .toJSON(),
];

export default commandDefinitions;
