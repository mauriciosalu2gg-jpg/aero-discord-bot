import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Estado y diagnostico de la IA del bot')
    .addSubcommand(sc => sc.setName('status').setDescription('Muestra compañia/modelo actual y uso general'))
    .addSubcommand(sc => sc
      .setName('force')
      .setDescription('Fuerza un proveedor de IA especifico')
      .addStringOption(opt => opt
        .setName('proveedor')
        .setDescription('Proveedor a forzar, o "auto" para volver a la rotacion normal')
        .setRequired(true)
        .addChoices(
          { name: 'Auto (rotacion normal)', value: 'auto' },
          { name: 'OpenRouter', value: 'openrouter' },
          { name: 'Groq', value: 'groq' },
          { name: 'Google Gemini', value: 'gemini' },
          { name: 'Anthropic (Claude)', value: 'anthropic' },
          { name: 'OpenAI', value: 'openai' },
        ))),
  new SlashCommandBuilder()
    .setName('memoria')
    .setDescription('Gestion de memoria persistente del bot')
    .addSubcommand(sc => sc.setName('borrar_canal').setDescription('Resetea la memoria de este canal'))
    .addSubcommand(sc => sc.setName('borrar_server').setDescription('Resetea la memoria de todo este servidor'))
    .addSubcommand(sc => sc
      .setName('modo')
      .setDescription('Cambia como el bot guarda tu historial (privacidad)')
      .addStringOption(opt => opt
        .setName('modo')
        .setDescription('Elige el nivel de privacidad')
        .setRequired(true)
        .addChoices(
          { name: 'Desactivado (Off)', value: 'off' },
          { name: 'Por Servidor (Local)', value: 'local' },
          { name: 'Compartido (Global)', value: 'global' }
        )))
    .addSubcommand(sc => sc
      .setName('perfil')
      .setDescription('Guarda datos sobre ti para que el bot te recuerde')
      .addStringOption(opt => opt.setName('nombre').setDescription('Como quieres que te llame').setRequired(false))
      .addStringOption(opt => opt.setName('pronombres').setDescription('El/Ella/Elle').setRequired(false))
      .addStringOption(opt => opt.setName('instrucciones').setDescription('Como debe responderte').setRequired(false))),
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configuraciones generales del bot')
    .addSubcommand(sc => sc
      .setName('forcetalk')
      .setDescription('Hace que el bot responda siempre sin mencion (canal activo)')
      .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivado').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('seguridad')
      .setDescription('Activa o desactiva el modo amable/seguro')
      .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivado').setRequired(true))),
  new SlashCommandBuilder()
    .setName('imaginar')
    .setDescription('Genera una imagen con Inteligencia Artificial')
    .addStringOption(opt => opt.setName('prompt').setDescription('Lo que quieres que la IA dibuje').setRequired(true)),
  new SlashCommandBuilder()
    .setName('personalidad')
    .setDescription('Cambia el estilo de respuesta del bot')
    .addStringOption(opt => opt
      .setName('modo')
      .setDescription('Elige la personalidad del bot')
      .setRequired(true)
      .addChoices(
        { name: '🤖 Asistente (Predeterminado)', value: 'asistente' },
        { name: '🐱 Otaku / Anime', value: 'otaku' },
        { name: '💻 Hacker Sarcástico', value: 'hacker' },
        { name: '📜 Poeta Clásico', value: 'poeta' }
      )),
];

export default commandDefinitions;
