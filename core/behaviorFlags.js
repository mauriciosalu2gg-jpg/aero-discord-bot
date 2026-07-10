// core/behaviorFlags.js
// Flags de comportamiento controlables por el owner (Lara), por servidor:
// - swearing: si el bot puede decir groserias (ON por defecto)
// - factsAutoplay: si puede tirar datos curiosos solo cuando el chat esta muerto
// Se guardan en memoria de proceso + archivo local simple (no necesita DB).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAGS_FILE = path.join(__dirname, '..', 'data', 'behaviorFlags.json');

const DEFAULTS = { swearing: true, factsAutoplay: true, respectfulOnly: false };

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FLAGS_FILE, 'utf-8'));
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  fs.mkdirSync(path.dirname(FLAGS_FILE), { recursive: true });
  fs.writeFileSync(FLAGS_FILE, JSON.stringify(cache, null, 2));
}

export function getFlags(guildId) {
  const all = load();
  return { ...DEFAULTS, ...(all[guildId || 'global'] || {}) };
}

export function setFlag(guildId, key, value) {
  const all = load();
  const scope = guildId || 'global';
  all[scope] = { ...DEFAULTS, ...(all[scope] || {}), [key]: value };
  cache = all;
  persist();
  return all[scope];
}

// Frases naturales que detectan intencion de "parar" sin necesidad de un
// comando explicito, para cuando Lara simplemente escribe "para" en el chat.
const STOP_PHRASES = [
  'para', 'ya para', 'parale', 'callate', 'cállate', 'ya no digas groserias',
  'no digas mas groserias', 'se respetuoso', 'sé respetuoso', 'compotate',
  'compórtate', 'basta', 'ya basta', 'deja de decir groserias',
  'no cuentes mas datos curiosos', 'deja los datos curiosos',
];

const RESUME_PHRASES = [
  'ya puedes', 'ya podes', 'segui como antes', 'sigue como antes',
  'vuelve a la normalidad', 'ya puedes decir groserias', 'permiso concedido',
  'te doy permiso', 'dale de nuevo', 'segui con los datos curiosos',
];

export function matchesStopPhrase(content) {
  const lower = (content || '').toLowerCase();
  return STOP_PHRASES.some(p => lower.includes(p));
}

export function matchesResumePhrase(content) {
  const lower = (content || '').toLowerCase();
  return RESUME_PHRASES.some(p => lower.includes(p));
}

export default { getFlags, setFlag, matchesStopPhrase, matchesResumePhrase };
