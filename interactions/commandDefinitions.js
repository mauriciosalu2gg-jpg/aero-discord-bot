import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Centro de control de Inteligencia Artificial')
    .addSubcommand(sub => sub
      .setName('estado')
      .setDescription('Muestra el estado, latencia, modelo y uso de memoria actual')
    )
    .addSubcommand(sub => sub
      .setName('proveedor')
      .setDescription('Cambia el proveedor activo de IA')
      .addStringOption(opt => opt
        .setName('nombre')
        .setDescription('Nombre del proveedor (ej: auto, groq, gemini)')
        .setRequired(true)
        .addChoices(
          { name: 'Auto (rotacion normal)', value: 'auto' },
          { name: 'OpenRouter', value: 'openrouter' },
          { name: 'Groq', value: 'groq' },
          { name: 'Google Gemini', value: 'gemini' },
          { name: 'Anthropic (Claude)', value: 'anthropic' },
          { name: 'OpenAI', value: 'openai' },
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('imaginar')
      .setDescription('Genera una imagen con IA')
      .addStringOption(opt => opt
        .setName('prompt')
        .setDescription('Descripción de la imagen a generar')
        .setRequired(true)
      )
    )
    .addSubcommandGroup(group => group
      .setName('memoria')
      .setDescription('Gestión de memoria del usuario')
      .addSubcommand(sub => sub.setName('ver').setDescription('Ver el estado actual de la memoria'))
      .addSubcommand(sub => sub.setName('limpiar').setDescription('Borra el historial de mensajes de la IA'))
      .addSubcommand(sub => sub.setName('sincronizar').setDescription('Sincroniza la memoria con la nube'))
      .addSubcommand(sub => sub.setName('modo')
        .setDescription('Cambia el modo de memoria')
        .addStringOption(opt => opt
          .setName('tipo')
          .setDescription('Local o Global')
          .setRequired(true)
          .addChoices({ name: 'Local (Por servidor)', value: 'local' }, { name: 'Global (Compartida)', value: 'global' })
        )
      )
    )
    .addSubcommandGroup(group => group
      .setName('personalidad')
      .setDescription('Ajusta la personalidad del bot')
      .addSubcommand(sub => sub.setName('ver').setDescription('Ver configuración actual de personalidad'))
      .addSubcommand(sub => sub.setName('restablecer').setDescription('Vuelve a los valores por defecto'))
      .addSubcommand(sub => sub.setName('editar')
        .setDescription('Edita tu perfil para que la IA te trate diferente')
        .addStringOption(opt => opt.setName('nombre').setDescription('Como quieres que te llame').setRequired(false))
      )
    )
    .addSubcommandGroup(group => group
      .setName('conversacion')
      .setDescription('Opciones de la conversación actual')
      .addSubcommand(sub => sub.setName('reiniciar').setDescription('Inicia un tema nuevo sin borrar recuerdos'))
      .addSubcommand(sub => sub.setName('resumir').setDescription('Genera un resumen de lo hablado hasta ahora'))
    )
    // Placeholders futuros
    .addSubcommand(sub => sub.setName('chat').setDescription('Inicia un chat privado/efímero'))
    .addSubcommand(sub => sub.setName('herramientas').setDescription('Gestionar herramientas/plugins (Próximamente)'))
    .addSubcommand(sub => sub.setName('estadisticas').setDescription('Métricas de uso de IA (Próximamente)')),
  
  new SlashCommandBuilder()
    .setName('moderacion')
    .setDescription('Activa o desactiva la auto-moderación en este servidor')
    .addBooleanOption(opt => opt
      .setName('activar')
      .setDescription('true = activado, false = desactivado')
      .setRequired(true))
];

export default commandDefinitions;
