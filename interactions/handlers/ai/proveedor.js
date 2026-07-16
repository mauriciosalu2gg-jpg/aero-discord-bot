import { setForcedProvider } from '../../../services/ai/providerHealth.js';

export async function handleProveedor(interaction) {
  const nombre = interaction.options.getString('nombre');

  if (nombre === 'auto') {
    setForcedProvider(null);
    await interaction.reply({ content: 'Rotación de IA automática **restaurada**.', ephemeral: true });
  } else {
    setForcedProvider(nombre);
    await interaction.reply({ content: `Proveedor de IA forzado a: **${nombre}**`, ephemeral: true });
  }
}
