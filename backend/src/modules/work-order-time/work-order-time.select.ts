import { Prisma } from '../../generated/prisma';

const userBrief = {
  select: { id: true, firstName: true, lastName: true, email: true },
} as const;

/**
 * Campos de un registro de tiempo que necesita la línea de tiempo. Se comparte
 * con el detalle de la OT: un campo que no esté aquí se guarda pero nunca llega
 * al frontend.
 */
export const TIME_ENTRY_SELECT = {
  id: true,
  workOrderId: true,
  entryType: true,
  workedDate: true,
  hoursWorked: true,
  startAt: true,
  endAt: true,
  notes: true,
  extendedAt: true,
  closedBySystem: true,
  reviewedAt: true,
  adjustedAt: true,
  adjustReason: true,
  originalStartAt: true,
  originalEndAt: true,
  voidedAt: true,
  voidReason: true,
  createdAt: true,
  updatedAt: true,
  user: userBrief,
  createdBy: userBrief,
  reviewedBy: userBrief,
  adjustedBy: userBrief,
  voidedBy: userBrief,
  workOrderItem: { select: { id: true, productDescription: true } },
  machine: { select: { id: true, name: true } },
} satisfies Prisma.WorkOrderTimeEntrySelect;

/** Lo anterior más el número de OT, para listas que mezclan varias OT. */
export const TIME_ENTRY_WITH_WORK_ORDER_SELECT = {
  ...TIME_ENTRY_SELECT,
  workOrder: { select: { id: true, workOrderNumber: true } },
} satisfies Prisma.WorkOrderTimeEntrySelect;

/** Tarea del temporizador en curso. */
export const RUNNING_WHERE = {
  entryType: 'TIMER',
  endAt: null,
  voidedAt: null,
} satisfies Prisma.WorkOrderTimeEntryWhereInput;
