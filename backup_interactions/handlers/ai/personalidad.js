import { getUserMemoryConfig, setUserMemoryConfig } from '../../../core/memory/config.js';
import { getFlags, setFlag } from '../../../core/behaviorFlags.js';

export async function handlePersonalidad(interaction, action, value) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (action === 'ver') {
    const flags = getFlags(guildId);
    const botPersonality = flags.botPersonality || 'asistente';
    
    await interaction.followUp({
      content: `🎭 **Personalidad del Bot en este servidor:** \`${botPersonality}\``
    });
    return;
  }

  if (action === 'nombre_y_pronombre') {
    const config = await getUserMemoryConfig(userId);
    if (!config.profile) config.profile = {};

    const pronounMatch = value.match(/\(([^)]+)\)/);
    if (pronounMatch) {
      config.profile.pronouns = pronounMatch[1];
      config.profile.preferredName = value.replace(/\([^)]+\)/, '').trim();
    } else {
      config.profile.preferredName = value;
      config.profile.pronouns = '';
    }

    await setUserMemoryConfig(userId, config);
    await interaction.followUp({
      content: `✅ Guardado. Te llamaré **${config.profile.preferredName}**${config.profile.pronouns ? ` con pronombres **${config.profile.pronouns}**` : ''}.`
    });
    return;
  }

  if (action === 'editar_bot_personality') {
    if (!guildId) {
      await interaction.followUp({ content: '❌ La personalidad del bot solo se puede cambiar dentro de un servidor.' });
      return;
    }
    
    await setFlag(guildId, 'botPersonality', value);
    await interaction.followUp({
      content: `✅ La personalidad del bot en este servidor ha sido cambiada a: **${value}**.`
    });
    return;
  }
}
