export async function handleImaginarCommand(interaction) {
  const prompt = interaction.options.getString('prompt');
  
  await interaction.deferReply();

  try {
    const safePrompt = encodeURIComponent(prompt);
    // Pollinations AI endpoint: it generates and returns the raw image bytes based on the prompt
    // Adding a random seed to prevent caching the same prompt
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?seed=${seed}&nologo=true`;

    await interaction.editReply({
      content: `🎨 **Prompt:** ${prompt}`,
      embeds: [{
        color: 0x3498db,
        image: { url: imageUrl },
        footer: { text: 'Generado con Pollinations AI' }
      }]
    });
  } catch (err) {
    console.error('[imaginar]', err);
    await interaction.editReply({ content: 'Hubo un error al generar la imagen.' });
  }
}

export default { handleImaginarCommand };
