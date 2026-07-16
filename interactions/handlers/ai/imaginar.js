import { generateImage } from '../../../services/ImageManager.js';

export async function handleImaginar(interaction) {
  const prompt = interaction.options.getString('prompt');
  
  await interaction.deferReply();

  try {
    const imageResult = await generateImage(prompt);

    await interaction.editReply({
      content: `🎨 **Prompt:** ${prompt}`,
      embeds: [{
        color: 0x3498db,
        image: { url: imageResult.url },
        footer: { text: `Generado con ${imageResult.provider}` }
      }]
    });
  } catch (err) {
    console.error('[imaginar]', err);
    await interaction.editReply({ content: 'Hubo un error al generar la imagen.' });
  }
}
