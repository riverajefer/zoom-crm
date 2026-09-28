import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ordersApi } from '../../../api/orders.api';
import { ordersKeys } from '../hooks/useOrders';
import { OrderConsultaView } from '../components/OrderConsultaView';
import { OrderDetailPage } from './OrderDetailPage';

/**
 * Entrada de `/orders/:id`. Carga la OP primero (con la misma llave que usa la
 * página, así queda en caché) y decide: si es de otra sede llega en modo
 * consulta y se muestra la vista de solo lectura; si no, la página completa.
 *
 * La decisión va aquí y no dentro de `OrderDetailPage` porque esa página pide
 * de entrada pagos, aprobaciones y rentabilidad de la OP, que para una OP de
 * otra sede responderían 404. Ver docs/PLAN_SEDES.md §8.
 */
export const OrderDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading } = useQuery({
    queryKey: ordersKeys.detail(id!),
    queryFn: () => ordersApi.getById(id!),
    enabled: !!id,
  });

  if (isLoading) return <LoadingSpinner />;
  if (order?.accessMode === 'consulta') return <OrderConsultaView order={order} />;
  return <OrderDetailPage />;
};

export default OrderDetailRoute;
