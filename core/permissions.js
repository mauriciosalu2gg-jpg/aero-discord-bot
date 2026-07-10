// core/permissions.js
// Sistema de roles: creator (Lara) > subCreator (Gio) > admin > user.
//
// - creator (Lara): dueña del bot, sus instrucciones tienen prioridad sobre
//   cualquier otro usuario, incluyendo comandos de administracion del bot.
// - subCreator (Gio): el otro creador del bot, le dio imagen, descripcion y
//   apariencia (el bot es "little gio"/"mini gio", version mas joven del OC
//   original de Gio). El bot esta obligado a respetarlo siempre, como a un
//   "hermano mayor"/creador tambien, aunque el ultimo permiso final es de Lara.
// El owner/creator se detecta por Discord ID (recomendado, configuralo en
// .env) y como respaldo por username por si el ID no esta configurado.

const OWNER_USERNAME = 'le0_lara';
const OWNER_ID = process.env.OWNER_DISCORD_ID || '971639277626720268';
const SUB_CREATOR_ID = process.env.SUB_CREATOR_DISCORD_ID || '1005707582389899305';

export const ROLES = {
  CREATOR: 'creator',
  SUB_CREATOR: 'subCreator',
  ADMIN: 'admin',
  USER: 'user',
};

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
    return ROLES.CREATOR;
  }
  if (SUB_CREATOR_ID && id === SUB_CREATOR_ID) {
    return ROLES.SUB_CREATOR;
  }
  if (admins.has(id)) return ROLES.ADMIN;
  return ROLES.USER;
}

export function isOwner(user) {
  // Se mantiene por compatibilidad con el resto del codigo: "owner" sigue
  // siendo Lara (creator), la maxima autoridad sobre el bot.
  return getRole(user) === ROLES.CREATOR;
}

export function isSubCreator(user) {
  return getRole(user) === ROLES.SUB_CREATOR;
}

// Lara y Gio son ambos "creadores" del bot: el bot les debe respeto y
// reconocimiento especial a los dos, aunque solo Lara tiene la ultima
// palabra en configuracion/administracion.
export function isCreatorOrSubCreator(user) {
  const role = getRole(user);
  return role === ROLES.CREATOR || role === ROLES.SUB_CREATOR;
}

export function isAdminOrHigher(user) {
  const role = getRole(user);
  return role === ROLES.CREATOR || role === ROLES.ADMIN;
}

export default {
  ROLES,
  getRole,
  isOwner,
  isSubCreator,
  isCreatorOrSubCreator,
  isAdminOrHigher,
};
