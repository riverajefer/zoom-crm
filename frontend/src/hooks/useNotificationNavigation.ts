import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { enqueueSnackbar } from 'notistack';
import {
  notificationsApi,
  NotificationTargetType,
} from '../api/notifications.api';
import { PATHS } from '../router/paths';

const TARGET_ROUTES: Record<NotificationTargetType, (id: string) => string> = {
  ORDER: (id) => `${PATHS.ORDERS}/${id}`,
  QUOTE: (id) => `${PATHS.QUOTES}/${id}`,
  EXPENSE_ORDER: (id) => `${PATHS.EXPENSE_ORDERS}/${id}`,
  ACCOUNT_PAYABLE: (id) => `${PATHS.ACCOUNTS_PAYABLE}/${id}`,
  CLIENT: (id) => `${PATHS.CLIENTS}/${id}`,
  CASH_SESSION: (id) => PATHS.CASH_SESSION_HISTORY_DETAIL.replace(':id', id),
  SUPPLY: () => PATHS.INVENTORY_LOW_STOCK,
};

/**
 * `relatedType` que el backend sabe resolver (ver NotificationsService.resolveTarget).
 * Los que apuntan directo a la entidad navegan sin pedir nada al backend;
 * el resto guarda el ID de la solicitud y hay que resolver su entidad raíz.
 */
const DIRECT_TYPES: Record<string, NotificationTargetType> = {
  Order: 'ORDER',
  Quote: 'QUOTE',
  ExpenseOrder: 'EXPENSE_ORDER',
  AccountPayable: 'ACCOUNT_PAYABLE',
  Client: 'CLIENT',
  SUPPLY: 'SUPPLY',
};

const RESOLVABLE_TYPES = new Set([
  'AdvancePaymentApproval',
  'AdvisorChangeRequest',
  'ClientOwnershipAuthRequest',
  'DiscountApproval',
  'OrderEditRequest',
  'OrderStatusChangeRequest',
  'PaymentEditApproval',
  'RefundRequest',
  'PayrollDeduction',
  'Payment',
  'ExpenseOrderAuthRequest',
  'AccountPayableAuthRequest',
  'AccountPayablePaymentAuthRequest',
  'AccountPayablePaymentReversalRequest',
  'ClientAdvisorRequest',
  'CashMovement',
  'CashMovementVoidRequest',
]);

export const isNotificationNavigable = (
  relatedId?: string | null,
  relatedType?: string | null,
) =>
  !!relatedId &&
  !!relatedType &&
  (relatedType in DIRECT_TYPES || RESOLVABLE_TYPES.has(relatedType));

interface NavigableNotification {
  id: string;
  relatedId?: string | null;
  relatedType?: string | null;
}

/**
 * Lleva al detalle de la entidad (OP, OG, CP, cliente, sesión de caja…)
 * a la que se refiere una notificación. Retorna true si navegó.
 */
export const useNotificationNavigation = () => {
  const navigate = useNavigate();
  const inFlight = useRef(false);

  return useCallback(
    async ({ id, relatedId, relatedType }: NavigableNotification) => {
      if (!isNotificationNavigable(relatedId, relatedType) || inFlight.current) {
        return false;
      }

      const direct = DIRECT_TYPES[relatedType!];
      if (direct) {
        navigate(TARGET_ROUTES[direct](relatedId!));
        return true;
      }

      inFlight.current = true;
      try {
        const target = await notificationsApi.resolveTarget(id);
        if (!target) {
          enqueueSnackbar('El registro de esta notificación ya no existe', {
            variant: 'info',
          });
          return false;
        }
        navigate(TARGET_ROUTES[target.entityType](target.entityId));
        return true;
      } catch {
        enqueueSnackbar('No se pudo abrir el detalle de la notificación', {
          variant: 'error',
        });
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [navigate],
  );
};
