import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Centro de control de Inteligencia Artificial')
    .addStringOption(opt => opt
      .setName('proveedor')
      .setDescription('Cambia el proveedor activo de IA')
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
    .addBooleanOption(opt => opt
      .setName('estado')
      .setDescription('Muestra el estado, latencia, modelo y uso de memoria actual')
      .setRequired(false)
    )
    .addStringOption(opt => opt
      .setName('imaginar')
      .setDescription('Genera una imagen a partir del texto ingresado')
      .setRequired(false)
    )
    .addBooleanOption(opt => opt
      .setName('limpiar_memoria')
      .setDescription('Borra todo el historial de mensajes de la IA')
      .setRequired(false)
    )
    .addStringOption(opt => opt
      .setName('modo_memoria')
      .setDescription('Cambia el modo de retención de memoria')
      .setRequired(false)
      .addChoices({ name: 'Local (Por servidor)', value: 'local' }, { name: 'Global (Compartida)', value: 'global' })
    )
    .addStringOption(opt => opt
      .setName('editar_personalidad')
      .setDescription('Dile a la IA cómo quieres que te llame')
      .setRequired(false)
    )
    .addBooleanOption(opt => opt
      .setName('ver_personalidad')
      .setDescription('Ver cómo la IA te recuerda actualmente')
      .setRequired(false)
    )
    .addUserOption(opt => opt
      .setName('pts_reset')
      .setDescription('Resetear puntos de moderación de un usuario (Solo Owners)')
      .setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('moderacion')
    .setDescription('Activa o desactiva la auto-moderación en este servidor')
    .addBooleanOption(opt => opt
      .setName('activar')
      .setDescription('true = activado, false = desactivado')
      .setRequired(true))
    .addIntegerOption(opt => opt
      .setName('horas')
      .setDescription('Duración activa en horas (ej: 24). Usar solo si activas.')
      .setRequired(false))
    .addIntegerOption(opt => opt
      .setName('dias')
      .setDescription('Duración activa en días (ej: 1). Usar solo si activas.')
      .setRequired(false))
];

export default commandDefinitions;
