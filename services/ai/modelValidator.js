// services/ai/modelValidator.js
// Valida al arrancar (y opcionalmente cada cierto tiempo) que los modelos
// configurados en MODEL_LADDERS realmente existen segun la API oficial de
// cada proveedor, para no descubrir un modelo retirado recien cuando un
// usuario le habla al bot. Si un proveedor no tiene URL de discovery
// configurada, se confia en MODEL_LADDERS tal cual (no se valida).
//
// Efecto de la validacion:
//  - Si ALGUNO de los modelos de la escalera de un proveedor sigue
//    existiendo, ese proveedor sigue disponible (con su escalera filtrada
//    a solo los modelos validos, para no perder tiempo reintentando un
//    404 conocido).
//  - Si NINGUNO existe, el proveedor se marca Unavailable en providerHealth
//    y se salta por completo hasta el proximo restart.
import { MODEL_LADDERS, MODEL_DISCOVERY_URLS } from '../../config/providers.js';
import { markUnavailable } from './providerHealth.js';

const DISCOVERY_TIMEOUT_MS = 8000;

// providerName -> Set<string> de model ids validos segun la ultima consulta.
// Si un proveedor no aparece aca, significa que no se pudo validar (ej: sin
// API key, la API de discovery fallo, o no hay URL configurada) y se debe
// asumir que toda su escalera es valida (fail-open, no fail-closed).
const validatedModels = new Map();

async function fetchModelIds(url, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    return new Set(list.map(m => m.id || m.name).filter(Boolean));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Valida un proveedor puntual contra su API de discovery, si tiene una
 * configurada y tiene API Key. No lanza excepciones: si algo falla, se
 * asume fail-open (no se descarta ningun modelo).
 * @param {string} providerName
 * @param {string} apiKey
 */
export async function validateProviderModels(providerName, apiKey) {
  const url = MODEL_DISCOVERY_URLS[providerName];
  if (!url || !apiKey) return; // sin discovery configurado o sin key: fail-open

  const ids = await fetchModelIds(url, apiKey);
  if (!ids || ids.size === 0) return; // discovery no disponible ahora mismo: fail-open

  validatedModels.set(providerName, ids);

  const ladder = MODEL_LADDERS[providerName] || [];
  const stillValid = ladder.filter(m => ids.has(m));

  if (ladder.length > 0 && stillValid.length === 0) {
    console.warn(`[modelValidator] ${providerName}: ninguno de sus modelos configurados (${ladder.join(', ')}) existe segun la API. Marcando Unavailable.`);
    markUnavailable(providerName, `Ningun modelo configurado existe: ${ladder.join(', ')}`);
  } else {
    const missing = ladder.filter(m => !ids.has(m));
    if (missing.length > 0) {
      console.warn(`[modelValidator] ${providerName}: modelo(s) obsoleto(s) detectado(s) y sera(n) omitido(s): ${missing.join(', ')}`);
    }
  }
}

/**
 * Corre la validacion para todos los proveedores con API Key disponible.
 * Pensado para llamarse una vez al arrancar el bot.
 * @param {Array<{name:string, apiKey:string}>} providers
 */
export async function validateAllProviders(providers) {
  await Promise.all(
    providers.map(p => validateProviderModels(p.name, p.apiKey).catch(() => {}))
  );
}

/**
 * Filtra una escalera de modelos a solo los que la validacion dinamica
 * confirmo que existen. Si el proveedor nunca se valido (fail-open), o si
 * el filtro dejaria la lista vacia (mejor intentar con lo que hay a no
 * intentar nada), devuelve la escalera original sin tocar.
 * @param {string} providerName
 * @param {string[]} ladder
 * @returns {string[]}
 */
export function filterValidModels(providerName, ladder) {
  const ids = validatedModels.get(providerName);
  if (!ids) return ladder;
  const filtered = ladder.filter(m => ids.has(m));
  return filtered.length > 0 ? filtered : ladder;
}

export default { validateProviderModels, validateAllProviders, filterValidModels };
