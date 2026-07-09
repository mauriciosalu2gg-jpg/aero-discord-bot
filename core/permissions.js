// core/permissions.js
// Sistema de roles: owner (Lara) > admin > user.
// El owner se detecta por Discord ID (recomendado, poné OWNER_DISCORD_ID en .env)
// y como respaldo por username "le0_lara" por si el ID no está configurado.

const OWNER_USERNAME = 'le0_lara';
const OWNER_ID = process.env.OWNER_DISCORD_ID || '';

export const ROLES = { OWNER: 'owner', ADMIN: 'admin', USER: 'user' };

const admins = new Set(
  (process.env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

export function getRole(user) {
  if (!user) return ROLES.USER;
  const id = user.id;
  const username = (user.username || '').toLowerCase();

  if ((OWNER_ID && id === OWNER_ID) || username === OWNER_USERNAME) {
    return ROLES.OWNER;
  }
  if (admins.has(id)) return ROLES.ADMIN;
  return ROLES.USER;
}

export function isOwner(user) {
  return getRole(user) === ROLES.OWNER;
}

export function isAdminOrHigher(user) {
  const role = getRole(user);
  return role === ROLES.OWNER || role === ROLES.ADMIN;
}

export default { ROLES, getRole, isOwner, isAdminOrHigher };
