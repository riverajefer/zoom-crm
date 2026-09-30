import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useAuthStore } from '../../../store/authStore';
import { useLocationStore } from '../../../store/locationStore';
import { createSocket } from '../../../lib/socket';
import type { Socket } from 'socket.io-client';

export function useApprovalSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  // Las salas de sede se eligen al conectar: si empieza o termina un apoyo en
  // otra sede (docs/PLAN_SEDES.md §16), hay que reconectar.
  const supportId = useLocationStore((s) => s.activeSupport?.id ?? null);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    const socket = createSocket(accessToken);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('approval_request_created', (data: { order?: { orderNumber?: string } }) => {
      queryClient.invalidateQueries({ queryKey: ['advancePaymentApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['refund-requests'] });
      const orderNum = data?.order?.orderNumber || '';
      enqueueSnackbar(
        `Nueva solicitud de aprobación${orderNum ? ` — Orden ${orderNum}` : ''}`,
        { variant: 'info' },
      );
    });

    socket.on('approval_request_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['advancePaymentApprovals'] });
      queryClient.invalidateQueries({ queryKey: ['refund-requests'] });
    });

    socket.on('connect_error', (err: Error) => {
      console.warn('[WS] Connection error:', err.message);
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [accessToken, supportId, queryClient, enqueueSnackbar]);

  return { isConnected };
}
