import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Centro de control de Inteligencia Artificial de Novarito')
    .addSubcommand(sub => sub
      .setName('chat')
      .setDescription('Habla directamente con Novarito por comando slash')
      .addStringOption(opt => opt.setName('mensaje').setDescription('Lo que quieres decirle a Novarito').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('imaginar')
      .setDescription('Genera una imagen a partir del texto ingresado')
      .addStringOption(opt => opt.setName('prompt').setDescription('Lo que quieres imaginar').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('estado')
      .setDescription('Muestra el estado, latencia, modelo y uso de memoria actual')
    )
    .addSubcommand(sub => sub
      .setName('proveedor')
      .setDescription('Cambia el proveedor activo de IA')
      .addStringOption(opt => opt
        .setName('nombre')
        .setDescription('Nombre del proveedor')
        .setRequired(true)
        .addChoices(
          { name: 'Auto (rotación normal)', value: 'auto' },
          { name: 'OpenRouter', value: 'openrouter' },
          { name: 'Groq', value: 'groq' },
          { name: 'Google Gemini', value: 'gemini' },
          { name: 'Anthropic (Claude)', value: 'anthropic' },
          { name: 'OpenAI', value: 'openai' },
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('limpiar_memoria')
      .setDescription('Borra todo el historial de mensajes y datos de la memoria de la IA')
      .addStringOption(opt => opt
        .setName('servidor')
        .setDescription('ID del servidor a limpiar (o "este", "global", "todos")')
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('editar_personalidad')
      .setDescription('Cambia la personalidad del bot')
      .addStringOption(opt => opt.setName('rasgo').setDescription('Rasgo (ej: enojado, gracioso, empático)').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('ver_personalidad')
      .setDescription('Muestra la personalidad del bot')
    )
    .addSubcommand(sub => sub
      .setName('pts_reset')
      .setDescription('Resetear puntos de moderación de un usuario (Alto mando)')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a perdonar').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('moderacion')
    .setDescription('Gestión de auto-moderación y guardianes del servidor')
    .addSubcommand(sub => sub
      .setName('activar')
      .setDescription('Activa o desactiva la auto-moderación')
      .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivar').setRequired(true))
      .addIntegerOption(opt => opt.setName('horas').setDescription('Duración activa en horas (ej: 24)').setRequired(false))
      .addIntegerOption(opt => opt.setName('dias').setDescription('Duración activa en días (ej: 1)').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('desactivar')
      .setDescription('Desactiva la auto-moderación en el servidor')
    )
    .addSubcommand(sub => sub
      .setName('estado')
      .setDescription('Muestra el estado de la moderación y los guardianes activos')
    )
    .addSubcommand(sub => sub
      .setName('guardianes')
      .setDescription('Asigna hasta 6 guardianes para recibir notificaciones e infracciones de moderación')
      .addUserOption(opt => opt.setName('usuario1').setDescription('Guardián 1').setRequired(true))
      .addUserOption(opt => opt.setName('usuario2').setDescription('Guardián 2').setRequired(false))
      .addUserOption(opt => opt.setName('usuario3').setDescription('Guardián 3').setRequired(false))
      .addUserOption(opt => opt.setName('usuario4').setDescription('Guardián 4').setRequired(false))
      .addUserOption(opt => opt.setName('usuario5').setDescription('Guardián 5').setRequired(false))
      .addUserOption(opt => opt.setName('usuario6').setDescription('Guardián 6').setRequired(false))
    ),
];

export default commandDefinitions;
