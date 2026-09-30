import React, { useMemo } from 'react';
import { IconButton, Badge, Tooltip } from '@mui/material';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { PATHS } from '../../router/paths';

import { orderStatusChangeRequestsApi } from '../../api/order-status-change-requests.api';
import { editRequestsApi } from '../../api/edit-requests.api';
import { expenseOrderAuthRequestsApi } from '../../api/expense-order-auth-requests.api';
import { advancePaymentApprovalsApi } from '../../api/advance-payment-approvals.api';
import { clientOwnershipAuthRequestsApi } from '../../api/client-ownership-auth-requests.api';
import { refundRequestsApi } from '../../api/refund-requests.api';
import { advisorChangeRequestsApi } from '../../api/advisor-change-requests.api';
import { clientAdvisorRequestsApi } from '../../api/client-advisor-requests.api';
import { quoteRestoreRequestsApi } from '../../api/quote-restore-requests.api';
import { locationSupportsApi } from '../../api/location-supports.api';
import { LOCATION_SUPPORTS_KEY } from '../../features/sedes/hooks/useLocationSupports';

export const PendingApprovalsBell: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();

  const isAdmin = user?.role?.name === 'admin';
  const canApproveOrders = hasPermission('approve_orders') || isAdmin;
  const canApproveAdvancePayments = hasPermission('approve_advance_payments') || isAdmin;
  const canApproveClientOwnership = hasPermission('approve_client_ownership_auth') || isAdmin;
  const canApproveAdvisorChange = hasPermission('approve_advisor_change') || isAdmin;
  const canApproveClientAdvisor = hasPermission('approve_client_advisor') || isAdmin;
  const canApproveQuoteRestore = hasPermission('approve_quote_restore') || isAdmin;
  const canApproveExpenseOrders = hasPermission('approve_expense_orders') || isAdmin;
  const canApproveRefunds = hasPermission('approve_refunds') || isAdmin;
  // Solo Zoom: apoyos en otra sede (docs/PLAN_SEDES.md §16)
  const canAuthorizeSupports = hasPermission('authorize_location_support');

  const { data: statusRequests } = useQuery({
    queryKey: ['statusChangeRequests', 'pending', 'badge'],
    queryFn: () => orderStatusChangeRequestsApi.findPending(),
    enabled: !!canApproveOrders,
  });

  const { data: editRequests } = useQuery({
    queryKey: ['editRequests', 'pending', 'badge'],
    queryFn: () => editRequestsApi.findAllPending(),
    enabled: !!canApproveOrders,
  });

  const { data: ogAuthRequests } = useQuery({
    queryKey: ['ogAuthRequests', 'pending', 'badge'],
    queryFn: () => expenseOrderAuthRequestsApi.findPending(),
    enabled: !!canApproveExpenseOrders,
  });

  const { data: advanceRequests } = useQuery({
    queryKey: ['advancePaymentApprovals', 'pending', 'badge'],
    queryFn: () => advancePaymentApprovalsApi.findPending(),
    enabled: !!canApproveAdvancePayments,
  });

  const { data: ownershipRequests } = useQuery({
    queryKey: ['clientOwnershipAuthRequests', 'pending', 'badge'],
    queryFn: () => clientOwnershipAuthRequestsApi.findPending(),
    enabled: !!canApproveClientOwnership,
  });

  const { data: refundRequests } = useQuery({
    queryKey: ['refund-requests', 'pending', 'badge'],
    queryFn: () => refundRequestsApi.findPending(),
    enabled: !!canApproveRefunds,
  });

  const { data: advisorRequests } = useQuery({
    queryKey: ['advisorChangeRequests', 'pending', 'badge'],
    queryFn: () => advisorChangeRequestsApi.findPending(),
    enabled: !!canApproveAdvisorChange,
  });

  const { data: clientAdvisorRequests } = useQuery({
    queryKey: ['clientAdvisorRequests', 'pending', 'badge'],
    queryFn: () => clientAdvisorRequestsApi.findPending(),
    enabled: !!canApproveClientAdvisor,
  });

  const { data: quoteRestoreRequests } = useQuery({
    queryKey: ['quoteRestoreRequests', 'pending', 'badge'],
    queryFn: () => quoteRestoreRequestsApi.findPending(),
    enabled: !!canApproveQuoteRestore,
  });

  const { data: supportRequests } = useQuery({
    queryKey: [...LOCATION_SUPPORTS_KEY, 'list', 'pending', null],
    queryFn: () => locationSupportsApi.list('pending'),
    enabled: canAuthorizeSupports,
  });

  const totalPending = useMemo(() => {
    let count = 0;
    if (statusRequests) count += statusRequests.length;
    if (editRequests) count += editRequests.length;
    if (ogAuthRequests) count += ogAuthRequests.length;
    if (advanceRequests) count += advanceRequests.length;
    if (ownershipRequests) count += ownershipRequests.length;
    if (refundRequests) count += refundRequests.length;
    if (advisorRequests) count += advisorRequests.length;
    if (clientAdvisorRequests) count += clientAdvisorRequests.length;
    if (quoteRestoreRequests) count += quoteRestoreRequests.length;
    if (supportRequests) count += supportRequests.length;
    return count;
  }, [statusRequests, editRequests, ogAuthRequests, advanceRequests, ownershipRequests, refundRequests, advisorRequests, clientAdvisorRequests, quoteRestoreRequests, supportRequests]);

  const hasAnyPermission = canApproveOrders || canApproveAdvancePayments || canApproveClientOwnership || canApproveAdvisorChange || canApproveClientAdvisor || canApproveQuoteRestore || canApproveExpenseOrders || canApproveRefunds || canAuthorizeSupports || isAdmin;

  if (!hasAnyPermission) {
    return null;
  }

  const handleClick = () => {
    // Si lo único pendiente son apoyos entre sedes, se va directo a su página.
    const onlySupports = totalPending > 0 && totalPending === (supportRequests?.length ?? 0);
    navigate(onlySupports ? PATHS.LOCATION_SUPPORTS : `${PATHS.ORDERS}/status-change-requests`);
  };

  return (
    <Tooltip title="Gestionar solicitudes pendientes de aprobación">
      <IconButton color="inherit" onClick={handleClick}>
        <Badge badgeContent={totalPending} color="warning">
          <AssignmentTurnedInIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
};
