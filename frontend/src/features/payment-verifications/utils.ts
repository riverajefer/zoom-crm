export const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(Number(value));

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const fullName = (user?: { firstName: string | null; lastName: string | null } | null) =>
  user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || '—' : '—';
