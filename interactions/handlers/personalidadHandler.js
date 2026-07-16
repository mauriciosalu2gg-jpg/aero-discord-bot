import { setFlag } from '../../core/behaviorFlags.js';

export async function handlePersonalidadCommand(interaction) {
  const modo = interaction.options.getString('modo');
  const guildId = interaction.guildId || 'global';
  
  await setFlag(guildId, 'botPersonality', modo);

  const descripciones = {
    'asistente': '🤖 Modo Asistente: Responderé de manera clara, útil y amigable.',
    'otaku': '🐱 Modo Otaku: Hablaré con referencias de anime, nya~',
    'hacker': '💻 Modo Hacker: Respuestas sarcásticas, directas y con actitud cyberpunk.',
    'poeta': '📜 Modo Poeta: Responderé con versos y un vocabulario elegante.'
  };

  await interaction.reply({
    content: descripciones[modo] || `Personalidad cambiada a ${modo}.`,
    ephemeral: false
  });
}

export default { handlePersonalidadCommand };
