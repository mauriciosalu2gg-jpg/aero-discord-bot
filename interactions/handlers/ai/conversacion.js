export async function handleConversacion(interaction) {
  const sub = interaction.options.getSubcommand();
  await interaction.reply({ content: `Función de conversación (${sub}) en desarrollo. Próximamente.`, ephemeral: true });
}
