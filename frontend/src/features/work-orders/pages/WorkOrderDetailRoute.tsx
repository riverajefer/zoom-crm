import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { workOrdersApi } from '../../../api/work-orders.api';
import { workOrdersKeys } from '../hooks/useWorkOrders';
import { WorkOrderConsultaView } from '../components/WorkOrderConsultaView';
import WorkOrderDetailPage from './WorkOrderDetailPage';

/** Entrada de `/work-orders/:id`: vista de consulta o página completa. Ver `OrderDetailRoute`. */
export const WorkOrderDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: workOrder, isLoading } = useQuery({
    queryKey: workOrdersKeys.detail(id || ''),
    queryFn: () => workOrdersApi.getById(id!),
    enabled: !!id,
  });

  if (isLoading) return <LoadingSpinner />;
  if (workOrder?.accessMode === 'consulta') return <WorkOrderConsultaView workOrder={workOrder} />;
  return <WorkOrderDetailPage />;
};

export default WorkOrderDetailRoute;
