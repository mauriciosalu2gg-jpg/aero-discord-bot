import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Centro de control de Inteligencia Artificial de Novarito')
    .addStringOption(opt => opt
      .setName('opcion')
      .setDescription('Selecciona una opción del menú de IA')
      .setRequired(false)
      .addChoices(
        { name: '💬 Chat - Habla con Novarito', value: 'chat' },
        { name: '📊 Estado - Diagnóstico de IA y Memoria', value: 'estado' },
        { name: '🎨 Imaginar - Generar imagen', value: 'imaginar' },
        { name: '🧹 Limpiar Memoria - Borrar historial', value: 'limpiar_memoria' },
        { name: '⚙️ Modo Memoria - Local vs Global', value: 'modo_memoria' },
        { name: '⚡ Proveedor - Cambiar modelo/API', value: 'proveedor' },
        { name: '👤 Nombre y Pronombre - Tus datos', value: 'nombre_y_pronombre' },
        { name: '🎭 Editar Personalidad - Cambiar rasgo', value: 'editar_personalidad' },
        { name: '👁️ Ver Personalidad - Ver configuración', value: 'ver_personalidad' },
        { name: '✨ Reset Puntos - Perdonar usuario', value: 'pts_reset' },
      )
    )
    .addStringOption(opt => opt.setName('mensaje').setDescription('Texto o mensaje para chat / imaginar / rasgo').setRequired(false))
    .addStringOption(opt => opt
      .setName('nivel')
      .setDescription('Nivel para modo_memoria: local o global')
      .setRequired(false)
      .addChoices({ name: 'Local (Por servidor)', value: 'local' }, { name: 'Global (Compartida)', value: 'global' })
    )
    .addStringOption(opt => opt.setName('servidor').setDescription('Servidor a limpiar ("este", "global", "todos" o ID)').setRequired(false))
    .addStringOption(opt => opt
      .setName('nombre_proveedor')
      .setDescription('Proveedor de IA')
      .setRequired(false)
      .addChoices(
        { name: 'Auto (rotacion normal)', value: 'auto' },
        { name: 'OpenRouter', value: 'openrouter' },
        { name: 'Groq', value: 'groq' },
        { name: 'Google Gemini', value: 'gemini' },
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI', value: 'openai' },
      )
    )
    .addStringOption(opt => opt.setName('nombre').setDescription('Tu nombre').setRequired(false))
    .addStringOption(opt => opt.setName('pronombre').setDescription('Tu pronombre').setRequired(false))
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario para pts_reset').setRequired(false)),

  new SlashCommandBuilder()
    .setName('moderacion')
    .setDescription('Gestión de auto-moderación y guardianes del servidor')
    .addStringOption(opt => opt
      .setName('accion')
      .setDescription('Acción a realizar')
      .setRequired(false)
      .addChoices(
        { name: '🛡️ Activar Moderación', value: 'activar' },
        { name: '👥 Asignar Guardianes', value: 'guardianes' },
        { name: '📊 Ver Estado Actual', value: 'estado' },
        { name: '🔴 Desactivar Moderación', value: 'desactivar' },
      )
    )
    .addBooleanOption(opt => opt.setName('activar').setDescription('true = activar, false = desactivar').setRequired(false))
    .addIntegerOption(opt => opt.setName('horas').setDescription('Duración en horas (ej: 24)').setRequired(false))
    .addIntegerOption(opt => opt.setName('dias').setDescription('Duración en días (ej: 1)').setRequired(false))
    .addUserOption(opt => opt.setName('usuario1').setDescription('Guardián 1').setRequired(false))
    .addUserOption(opt => opt.setName('usuario2').setDescription('Guardián 2').setRequired(false))
    .addUserOption(opt => opt.setName('usuario3').setDescription('Guardián 3').setRequired(false))
    .addUserOption(opt => opt.setName('usuario4').setDescription('Guardián 4').setRequired(false))
    .addUserOption(opt => opt.setName('usuario5').setDescription('Guardián 5').setRequired(false))
    .addUserOption(opt => opt.setName('usuario6').setDescription('Guardián 6').setRequired(false))
];

export default commandDefinitions;
