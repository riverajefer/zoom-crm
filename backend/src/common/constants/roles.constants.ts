/**
 * Roles y permisos que el sistema reconoce por nombre.
 *
 * Solo Zoom tiene `soporte` y los permisos reservados: ver docs/PLAN_SEDES.md §6.1.
 */

/**
 * El administrador del negocio. El sistema lo reconoce por este nombre en
 * decenas de lugares (aprobaciones, notificaciones, guards), así que está
 * reservado: ningún otro rol puede llamarse así, ni con otras mayúsculas.
 */
export const ADMIN_ROLE_NAME = 'admin';

/**
 * Soporte técnico (quien mantiene el sistema, no el cliente). Tiene todo lo del
 * admin más los permisos reservados, está por encima de él en las reglas de
 * privilegio y no se muestra a nadie más: ni el rol, ni sus usuarios. No recibe
 * aprobaciones, porque esas se buscan por el nombre `admin`.
 */
export const SUPPORT_ROLE_NAME = 'soporte';

/**
 * Permisos que solo tiene `soporte`. No aparecen en las pantallas de roles y
 * permisos, y la API rechaza otorgarlos: sin esto el admin, que edita roles sin
 * restricción, podría dárselos a sí mismo.
 */
export const RESERVED_PERMISSIONS: readonly string[] = ['manage_locations'];

export function isReservedPermission(name: string): boolean {
  return RESERVED_PERMISSIONS.includes(name);
}

/** ¿El nombre choca con el de un rol reservado (`admin` o `soporte`)? */
export function isReservedRoleName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === ADMIN_ROLE_NAME || normalized === SUPPORT_ROLE_NAME;
}
