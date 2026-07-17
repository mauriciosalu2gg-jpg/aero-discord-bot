import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  // 1. AI CONTROL PANEL
  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Centro de control de Inteligencia Artificial')
    .addSubcommand(sub => sub
      .setName('chat')
      .setDescription('Habla directamente con la IA')
      .addStringOption(opt => opt.setName('mensaje').setDescription('Lo que quieres decirle a Novarito').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('proveedor')
      .setDescription('Cambia el proveedor activo de IA')
      .addStringOption(opt => opt
        .setName('nombre')
        .setDescription('Nombre del proveedor')
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
      .setName('estado')
      .setDescription('Muestra el estado, latencia, modelo y uso de memoria actual')
    )
    .addSubcommand(sub => sub
      .setName('imaginar')
      .setDescription('Genera una imagen a partir del texto ingresado')
      .addStringOption(opt => opt.setName('prompt').setDescription('Lo que quieres imaginar').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('limpiar_memoria')
      .setDescription('Borra todo el historial de mensajes de la IA')
    )
    .addSubcommand(sub => sub
      .setName('modo_memoria')
      .setDescription('Cambia el modo de retención de memoria')
      .addStringOption(opt => opt
        .setName('nivel')
        .setDescription('Nivel de retención')
        .setRequired(true)
        .addChoices({ name: 'Local (Por servidor)', value: 'local' }, { name: 'Global (Compartida)', value: 'global' })
      )
    )
    .addSubcommand(sub => sub
      .setName('nombre_y_pronombre')
      .setDescription('Dile a la IA cómo quieres que te llame y tus pronombres')
      .addStringOption(opt => opt.setName('nombre').setDescription('Tu nombre').setRequired(true))
      .addStringOption(opt => opt.setName('pronombre').setDescription('Tu pronombre').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('editar_personalidad')
      .setDescription('Cambia la personalidad del bot')
      .addStringOption(opt => opt.setName('rasgo').setDescription('Rasgo (ej: enojado, gracioso)').setRequired(true))
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

  // 2. MODERACIÓN (Alto Mando)
  new SlashCommandBuilder()
    .setName('moderacion')
    .setDescription('Herramientas de moderación automática')
    .addSubcommand(sub => sub
      .setName('estado')
      .setDescription('Activa o desactiva la auto-moderación en este servidor')
      .addBooleanOption(opt => opt.setName('activar').setDescription('true = activado, false = desactivado').setRequired(true))
      .addIntegerOption(opt => opt.setName('horas').setDescription('Duración activa en horas').setRequired(false))
      .addIntegerOption(opt => opt.setName('dias').setDescription('Duración activa en días').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('guardian')
      .setDescription('Configura quién recibe notificaciones del bot al borrar mensajes')
      .addStringOption(opt => opt.setName('modo').setDescription('Modo de alertas (auto/custom)').setRequired(false).addChoices({ name: 'Automático', value: 'auto' }, { name: 'Personalizado', value: 'custom' }))
      .addIntegerOption(opt => opt.setName('limite').setDescription('Cantidad máxima de personas a notificar').setRequired(false))
      .addUserOption(opt => opt.setName('agregar').setDescription('Agrega un usuario a la lista').setRequired(false))
      .addUserOption(opt => opt.setName('quitar').setDescription('Quita un usuario de la lista').setRequired(false))
      .addBooleanOption(opt => opt.setName('listar').setDescription('Muestra la configuración de avisos').setRequired(false))
      .addBooleanOption(opt => opt.setName('limpiar').setDescription('Restablece la configuración').setRequired(false))
      .addStringOption(opt => opt.setName('registrar_autor_id').setDescription('Registra manualmente un borrado: ID del autor').setRequired(false))
      .addStringOption(opt => opt.setName('registrar_accion').setDescription('Acción tomada (ej. MUTE)').setRequired(false))
      .addStringOption(opt => opt.setName('registrar_resumen').setDescription('Resumen del texto original').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('karma')
      .setDescription('Ajusta el karma (puntos a favor) de un usuario')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario al que modificar el karma').setRequired(true))
      .addIntegerOption(opt => opt.setName('puntos').setDescription('Cantidad de karma (0-100)').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('permisos_link')
      .setDescription('Otorga o quita permiso a un usuario para enviar links en canales de spam')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario al que modificar el permiso').setRequired(true))
      .addBooleanOption(opt => opt.setName('permitir').setDescription('true = permitir, false = quitar permiso').setRequired(true))
    ),

  // 3. NOVARITO (Mega Comando de Utilidades, Herramientas, Diversión, Preferencias)
  new SlashCommandBuilder()
    .setName('novarito')
    .setDescription('Todas las herramientas, comandos divertidos y preferencias del asistente')
    // ============================
    // GRUPO: HERRAMIENTAS
    // ============================
    .addSubcommandGroup(group => group
      .setName('herramientas')
      .setDescription('Herramientas avanzadas de inteligencia artificial y web')
      .addSubcommand(sub => sub.setName('buscar').setDescription('Busca en la web y responde con información fresca')
        .addStringOption(opt => opt.setName('query').setDescription('Lo que quieres buscar').setRequired(true)))
      .addSubcommand(sub => sub.setName('investigar').setDescription('Realiza una investigación profunda en la web')
        .addStringOption(opt => opt.setName('tema').setDescription('El tema a investigar').setRequired(true)))
      .addSubcommand(sub => sub.setName('archivo').setDescription('Sube un documento de texto o PDF para leerlo y resumirlo')
        .addAttachmentOption(opt => opt.setName('documento').setDescription('Archivo a analizar').setRequired(true)))
      .addSubcommand(sub => sub.setName('enlace').setDescription('Analiza y extrae la información de una URL')
        .addStringOption(opt => opt.setName('url').setDescription('El enlace a analizar').setRequired(true)))
      .addSubcommand(sub => sub.setName('resumen').setDescription('Pega texto largo para resumirlo al instante')
        .addStringOption(opt => opt.setName('texto').setDescription('El texto a resumir').setRequired(true))
        .addStringOption(opt => opt.setName('formato').setDescription('El formato deseado (ej: puntos, lista, parrafo)').setRequired(false)))
      .addSubcommand(sub => sub.setName('traducir').setDescription('Traduce texto al idioma que indiques')
        .addStringOption(opt => opt.setName('texto').setDescription('Texto a traducir').setRequired(true))
        .addStringOption(opt => opt.setName('idioma').setDescription('Idioma destino').setRequired(true)))
      .addSubcommand(sub => sub.setName('reescribir').setDescription('Reescribe un texto con un tono específico')
        .addStringOption(opt => opt.setName('texto').setDescription('Texto a reescribir').setRequired(true))
        .addStringOption(opt => opt.setName('tono').setDescription('Tono para la reescritura').setRequired(false).addChoices({ name: 'Formal', value: 'formal' }, { name: 'Claro', value: 'claro' }, { name: 'Firme', value: 'firme' }, { name: 'Cercano', value: 'cercano' })))
      .addSubcommand(sub => sub.setName('detectar').setDescription('Detecta intenciones, riesgos o dobles sentidos en un texto')
        .addStringOption(opt => opt.setName('texto').setDescription('Texto a analizar').setRequired(true)))
      .addSubcommand(sub => sub.setName('prompt').setDescription('Convierte una idea base en un prompt fuerte y optimizado')
        .addStringOption(opt => opt.setName('idea').setDescription('Tu idea base').setRequired(true)))
      .addSubcommand(sub => sub.setName('hablar').setDescription('Envía una consulta directa a un proveedor específico de IA')
        .addStringOption(opt => opt.setName('texto').setDescription('Tu consulta').setRequired(true))
        .addStringOption(opt => opt.setName('proveedor').setDescription('Proveedor a forzar').setRequired(true).addChoices({ name: 'Groq', value: 'groq' }, { name: 'OpenRouter', value: 'openrouter' }, { name: 'Gemini', value: 'gemini' }, { name: 'OpenAI', value: 'openai' }, { name: 'Anthropic', value: 'anthropic' })))
      .addSubcommand(sub => sub.setName('simular').setDescription('Simula el estilo de respuesta de otro asistente')
        .addStringOption(opt => opt.setName('texto').setDescription('Tu mensaje').setRequired(true))
        .addStringOption(opt => opt.setName('identidad').setDescription('Asistente a simular').setRequired(true).addChoices({ name: 'ChatGPT', value: 'chatgpt' }, { name: 'Gemini', value: 'gemini' }, { name: 'Claude', value: 'claude' }, { name: 'Perplexity', value: 'perplexity' }, { name: 'Mistral', value: 'mistral' })))
      .addSubcommand(sub => sub.setName('comparar').setDescription('Compara las respuestas de dos proveedores distintos con el mismo mensaje')
        .addStringOption(opt => opt.setName('texto').setDescription('Mensaje a comparar').setRequired(true))
        .addStringOption(opt => opt.setName('proveedor_b').setDescription('Segundo proveedor').setRequired(true).addChoices({ name: 'Groq', value: 'groq' }, { name: 'OpenRouter', value: 'openrouter' }, { name: 'Gemini', value: 'gemini' }, { name: 'OpenAI', value: 'openai' }, { name: 'Anthropic', value: 'anthropic' })))
      .addSubcommand(sub => sub.setName('proveedores').setDescription('Muestra el estado de salud y latencia de los proveedores'))
    )
    // ============================
    // GRUPO: DIVERSION
    // ============================
    .addSubcommandGroup(group => group
      .setName('diversion')
      .setDescription('Comandos de entretenimiento e interacción con la IA')
      .addSubcommand(sub => sub.setName('pregunta').setDescription('Hazle una pregunta directa y rápida a la IA')
        .addStringOption(opt => opt.setName('texto').setDescription('Tu pregunta').setRequired(true)))
      .addSubcommand(sub => sub.setName('datorandom').setDescription('Recibe un dato muy aleatorio'))
      .addSubcommand(sub => sub.setName('roast').setDescription('Pídele a la IA un roast juguetón para un amigo')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a rostear').setRequired(true)))
      .addSubcommand(sub => sub.setName('chiste').setDescription('Crea un chiste corto original')
        .addStringOption(opt => opt.setName('tema').setDescription('Tema del chiste').setRequired(false)))
      .addSubcommand(sub => sub.setName('consejo').setDescription('Pídele un consejo a la IA')
        .addStringOption(opt => opt.setName('tema').setDescription('Tema del consejo').setRequired(false)))
      .addSubcommand(sub => sub.setName('cumplido').setDescription('Genera un cumplido creativo para un usuario')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a halagar').setRequired(true)))
      .addSubcommand(sub => sub.setName('animo').setDescription('Dale un mensaje de ánimo a alguien')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuario al que dar ánimo').setRequired(false)))
      .addSubcommand(sub => sub.setName('trivia').setDescription('Genera una trivia breve')
        .addStringOption(opt => opt.setName('categoria').setDescription('Categoría (ej: ciencia, historia)').setRequired(false)))
      .addSubcommand(sub => sub.setName('versus').setDescription('Compara a otro usuario contigo de forma divertida')
        .addUserOption(opt => opt.setName('usuario').setDescription('El contrincante').setRequired(true)))
      .addSubcommand(sub => sub.setName('adivina').setDescription('Hazle una pregunta de sí o no a la bola 8 de la IA')
        .addStringOption(opt => opt.setName('pregunta').setDescription('Tu pregunta').setRequired(true)))
      .addSubcommand(sub => sub.setName('horoscopo').setDescription('Consulta tu horóscopo del zodiaco con el bot')
        .addStringOption(opt => opt.setName('signo').setDescription('Tu signo zodiacal').setRequired(true)))
      .addSubcommand(sub => sub.setName('poema').setDescription('Pídele a la IA un poema corto')
        .addStringOption(opt => opt.setName('tema').setDescription('Tema opcional del poema').setRequired(false)))
    )
    // ============================
    // GRUPO: PERFIL Y PREFERENCIAS
    // ============================
    .addSubcommandGroup(group => group
      .setName('usuario')
      .setDescription('Configura tus preferencias y mira tu perfil')
      .addSubcommand(sub => sub.setName('perfil').setDescription('Muestra tu perfil guardado y la personalidad actual del bot')
        .addUserOption(opt => opt.setName('persona').setDescription('Perfil a revisar (opcional)').setRequired(false)))
      .addSubcommand(sub => sub.setName('configurar').setDescription('Guarda tus gustos e instrucciones para la memoria de la IA')
        .addStringOption(opt => opt.setName('nombre').setDescription('Tu nombre preferido para que la IA te llame').setRequired(false))
        .addStringOption(opt => opt.setName('pronombres').setDescription('Tus pronombres').setRequired(false))
        .addStringOption(opt => opt.setName('gustos').setDescription('Tus preferencias o gustos generales').setRequired(false))
        .addStringOption(opt => opt.setName('estilo').setDescription('Tu estilo de respuesta preferido').setRequired(false))
        .addStringOption(opt => opt.setName('instrucciones').setDescription('Instrucciones personalizadas sobre cómo debe actuar').setRequired(false))
        .addStringOption(opt => opt.setName('historial').setDescription('Detalles de tu historial personal').setRequired(false)))
      .addSubcommand(sub => sub.setName('limpiar').setDescription('Borra por completo tu perfil y memoria en el bot'))
    )
    // ============================
    // SUBCOMANDO: AYUDA
    // ============================
    .addSubcommand(sub => sub
      .setName('ayuda')
      .setDescription('Muestra un resumen rápido y visual de los comandos del bot')
    ),
];

export default commandDefinitions;
