export const WS_EVENTS = {
  APPROVAL_REQUEST_CREATED: 'approval_request_created',
  APPROVAL_REQUEST_UPDATED: 'approval_request_updated',
  /** Se aprobó, rechazó, programó o terminó un apoyo en otra sede del usuario (§16). */
  LOCATION_SUPPORT_CHANGED: 'location_support_changed',
} as const;

export const WS_ROOMS = {
  ADVANCE_PAYMENT_APPROVALS: 'approvals:advance_payments',
} as const;

/**
 * Sala de las aprobaciones de una sede (solo Zoom, docs/PLAN_SEDES.md §15.2).
 * `all` es la de quienes ven todas las sedes.
 */
export const advancePaymentSedeRoom = (locationId: string | 'all') =>
  `${WS_ROOMS.ADVANCE_PAYMENT_APPROVALS}:${locationId}`;

/** Sala personal de un usuario: avisos que son solo para él. */
export const userRoom = (userId: string) => `user:${userId}`;
