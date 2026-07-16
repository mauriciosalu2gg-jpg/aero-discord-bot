import { generateImage } from '../../../services/ImageManager.js';

export async function handleImaginar(interaction, prompt) {
  try {
    const imageResult = await generateImage(prompt);
    await interaction.followUp({
      content: `🎨 **Prompt:** ${prompt}`,
      embeds: [{
        color: 0x3498db,
        image: { url: imageResult.url },
        footer: { text: `Generado con ${imageResult.provider}` }
      }]
    });
  } catch (err) {
    console.error('[imaginar]', err);
    await interaction.followUp({ content: 'Hubo un error al generar la imagen.' });
  }
}
