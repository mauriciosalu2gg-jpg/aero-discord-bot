import { setForcedProvider } from '../../../services/ai/providerHealth.js';

export async function handleProveedor(interaction, nombre) {
  if (nombre === 'auto') {
    setForcedProvider(null);
  } else {
    setForcedProvider(nombre);
  }
}

