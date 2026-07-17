import { generateImage, cacheImagePrompt } from '../../../services/ImageManager.js';

export async function handleImaginar(interaction, prompt) {
  try {
    const imageResult = await generateImage(prompt);
    const reply = await interaction.followUp({
      content: `🎨 **Prompt:** ${prompt}`,
      embeds: [{
        color: 0x3498db,
        image: { url: imageResult.url },
        footer: { text: `Generado con ${imageResult.provider}` }
      }],
      fetchReply: true
    });
    
    // Almacenamos el prompt de esta imagen asociada al ID del mensaje enviado
    if (reply && reply.id) {
      cacheImagePrompt(reply.id, prompt);
    }
  } catch (err) {
    console.error('[imaginar]', err);
    await interaction.followUp({ content: 'Hubo un error al generar la imagen.' });
  }
}
