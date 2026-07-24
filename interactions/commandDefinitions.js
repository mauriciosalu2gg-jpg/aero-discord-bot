import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Centro de control de Inteligencia Artificial de Novarito')
    .addStringOption(opt => opt
      .setName('opcion')
      .setDescription('Acción o módulo de IA a ejecutar')
      .setRequired(true)
      .addChoices(
        { name: 'Chat (Habla con Novarito)', value: 'chat' },
        { name: 'Imaginar (Generar imagen)', value: 'imaginar' },
        { name: 'Estado (Diagnóstico de IA)', value: 'estado' },
        { name: 'Proveedor (Cambiar IA activa)', value: 'proveedor' },
        { name: 'Modo Memoria (Local / Global)', value: 'modo_memoria' },
        { name: 'Limpiar Memoria (Borrar historial)', value: 'limpiar_memoria' },
        { name: 'Editar Personalidad', value: 'editar_personalidad' },
        { name: 'Ver Personalidad', value: 'ver_personalidad' },
        { name: 'Reiniciar Puntos (Alto Mando)', value: 'pts_reset' },
      )
    )
    .addStringOption(opt => opt.setName('mensaje').setDescription('Mensaje, prompt, rasgo o parámetro').setRequired(false))
    .addStringOption(opt => opt
      .setName('nombre_proveedor')
      .setDescription('Proveedor de IA para /ai proveedor')
      .setRequired(false)
      .addChoices(
        { name: 'Auto (rotación normal)', value: 'auto' },
        { name: 'OpenRouter', value: 'openrouter' },
        { name: 'Groq', value: 'groq' },
        { name: 'Google Gemini', value: 'gemini' },
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI', value: 'openai' },
      )
    )
    .addStringOption(opt => opt
      .setName('nivel')
      .setDescription('Nivel de retención de memoria (modo_memoria)')
      .setRequired(false)
      .addChoices(
        { name: 'Local (Por servidor)', value: 'local' },
        { name: 'Global (Compartida)', value: 'global' },
      )
    )
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario objetivo (para pts_reset)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('moderacion')
    .setDescription('Gestión de auto-moderación y guardianes del servidor')
    .addStringOption(opt => opt
      .setName('accion')
      .setDescription('Acción de moderación')
      .setRequired(true)
      .addChoices(
        { name: 'Activar auto-moderación', value: 'activar' },
        { name: 'Desactivar auto-moderación', value: 'desactivar' },
        { name: 'Estado de moderación', value: 'estado' },
        { name: 'Asignar guardianes', value: 'guardianes' },
      )
    )
    .addBooleanOption(opt => opt.setName('activar').setDescription('true = activar, false = desactivar').setRequired(false))
    .addIntegerOption(opt => opt.setName('horas').setDescription('Duración en horas').setRequired(false))
    .addIntegerOption(opt => opt.setName('dias').setDescription('Duración en días').setRequired(false))
    .addUserOption(opt => opt.setName('usuario1').setDescription('Guardián 1').setRequired(false))
    .addUserOption(opt => opt.setName('usuario2').setDescription('Guardián 2').setRequired(false))
    .addUserOption(opt => opt.setName('usuario3').setDescription('Guardián 3').setRequired(false)),
];

export default commandDefinitions;
