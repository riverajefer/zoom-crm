export const WS_EVENTS = {
  APPROVAL_REQUEST_CREATED: 'approval_request_created',
  APPROVAL_REQUEST_UPDATED: 'approval_request_updated',
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
