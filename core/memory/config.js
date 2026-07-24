import { flushCached, getCached, setCached } from '../cache/firebaseCache.js';

const DEFAULT_CONFIG = {
  mode: 'global', // Memoria global SIEMPRE activa por defecto
  profile: {
    preferredName: '',
    pronouns: '',
    preferences: '',
    responseStyle: '',
    instructions: '',
    importantHistory: ''
  }
};

/**
 * Obtiene la configuracion de memoria de un usuario.
 */
export async function getUserMemoryConfig(userId) {
  const docPath = `users/${userId}/config/memory`;
  const data = await getCached(docPath, DEFAULT_CONFIG);
  const mode = data?.mode && data.mode !== 'off' ? data.mode : 'global';
  return { ...DEFAULT_CONFIG, ...data, mode, profile: { ...DEFAULT_CONFIG.profile, ...(data?.profile || {}) } };
}

/**
 * Guarda la configuracion de memoria de un usuario.
 */
export async function setUserMemoryConfig(userId, configData) {
  const docPath = `users/${userId}/config/memory`;
  setCached(docPath, configData);
  await flushCached(docPath);
}

/**
 * Formatea el perfil del usuario para inyectarlo en el system prompt.
 */
export function formatProfileForPrompt(profile) {
  if (!profile) return '';
  const parts = [];
  if (profile.preferredName) parts.push(`Nombre preferido: ${profile.preferredName}`);
  if (profile.pronouns) parts.push(`Pronombres: ${profile.pronouns}`);
  if (profile.preferences) parts.push(`Preferencias: ${profile.preferences}`);
  if (profile.responseStyle) parts.push(`Forma de responder: ${profile.responseStyle}`);
  if (profile.instructions) parts.push(`Instrucciones: ${profile.instructions}`);
  if (profile.importantHistory) parts.push(`Historial importante: ${profile.importantHistory}`);
  
  if (parts.length === 0) return '';
  return `\n\n--- PERFIL DEL USUARIO ---\n${parts.join('\n')}\n-------------------------\n`;
}
