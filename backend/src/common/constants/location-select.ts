/**
 * Datos de la sede que viajan con cada documento: los usan los chips, el modo
 * consulta y los PDF (dirección y teléfono). Ver docs/PLAN_SEDES.md.
 */
export const LOCATION_SUMMARY_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  color: true,
  address: true,
  phone: true,
} as const;
