import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Grid,
  Button,
  Stack,
  Divider,
  Skeleton,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useNavigate, useParams } from 'react-router-dom';
import { parsePhoneValue } from '../../../components/common/PhoneInputWithCountry';
import EditIcon from '@mui/icons-material/Edit';
import BusinessIcon from '@mui/icons-material/Business';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import BadgeIcon from '@mui/icons-material/Badge';
import NoteIcon from '@mui/icons-material/Note';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AllInboxIcon from '@mui/icons-material/AllInbox';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { GridRenderCellParams } from '@mui/x-data-grid';
import { PageHeader } from '../../../components/common/PageHeader';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { DataTable } from '../../../components/common/DataTable';
import { useClient, useClientStats } from '../hooks/useClients';
import { RequestClientAdvisorButton } from '../components/RequestClientAdvisorButton';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS } from '../../../utils/constants';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { ClientOrderHistory, ClientQuoteHistory } from '../../../types';
import { useLocationStore } from '../../../store/locationStore';
import { groupBySede } from '../../sedes/utils/groupBySede';
import { SedeGroupHeader } from '../../sedes/components/SedeGroupHeader';
import { QuoteStatusChip } from '../../quotes/components/QuoteStatusChip';
import type { QuoteStatus } from '../../../types/quote.types';

const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  IN_PRODUCTION: 'En producción',
  READY: 'Lista',
  DELIVERED: 'Entregada',
  DELIVERED_ON_CREDIT: 'Entregada a crédito',
  WARRANTY: 'Garantía',
  PAID: 'Pagada',
  RETURNED: 'Devolución de dinero',
  ANULADO: 'Anulada',
};

const ORDER_STATUS_COLORS: Record<
  string,
  'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'
> = {
  DRAFT: 'default',
  CONFIRMED: 'info',
  IN_PRODUCTION: 'warning',
  READY: 'secondary',
  DELIVERED: 'primary',
  DELIVERED_ON_CREDIT: 'primary',
  WARRANTY: 'warning',
  PAID: 'success',
  RETURNED: 'default',
  ANULADO: 'error',
};

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  color?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  icon,
  label,
  value,
  subtext,
  color,
}) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Stack direction='row' alignItems='center' spacing={1.5} mb={1}>
        <Box sx={{ color: color || 'primary.main' }}>{icon}</Box>
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          {label}
        </Typography>
      </Stack>
      <Typography
        variant='h5'
        fontWeight='bold'
        color={color || 'text.primary'}
      >
        {value}
      </Typography>
      {subtext && (
        <Typography variant='caption' color='text.secondary'>
          {subtext}
        </Typography>
      )}
    </CardContent>
  </Card>
);

const ClientDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { hasPermission, user } = useAuthStore();
  const isAdmin = user?.role?.name === 'admin';
  const { data: client, isLoading, error } = useClient(id || '');
  const { data: stats, isLoading: statsLoading } = useClientStats(id || '');
  const [orderFilter, setOrderFilter] = React.useState<'all' | 'pending' | 'paid'>('all');

  const filteredOrders = React.useMemo(() => {
    const orders = stats?.orders ?? [];
    if (orderFilter === 'pending') return orders.filter((o) => o.balance > 0);
    if (orderFilter === 'paid') return orders.filter((o) => o.balance <= 0);
    return orders;
  }, [stats?.orders, orderFilter]);

  // Los clientes son comunes: sus OP y COT llegan de todas las sedes que el
  // usuario puede consultar, y se muestran agrupadas, la sede activa primero.
  // Lo de otra sede se abre en modo consulta (docs/PLAN_SEDES.md §8).
  const activeLocationId = useLocationStore((s) => s.activeLocationId);
  const canViewAll = useLocationStore((s) => s.canViewAll);
  const orderGroups = React.useMemo(
    () => groupBySede(filteredOrders, activeLocationId),
    [filteredOrders, activeLocationId],
  );
  const quoteGroups = React.useMemo(
    () => groupBySede(stats?.quotes ?? [], activeLocationId),
    [stats?.quotes, activeLocationId],
  );
  const isConsultaSede = (sedeId: string | undefined) => !canViewAll && sedeId !== activeLocationId;

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error || !client) {
    return (
      <Box>
        <PageHeader title='Error' />
        <Typography color='error'>Cliente no encontrado</Typography>
      </Box>
    );
  }

  const InfoItem = ({
    icon,
    label,
    value,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string | React.ReactNode;
  }) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
      <Box sx={{ color: 'text.secondary', mt: 0.5 }}>{icon}</Box>
      <Box>
        <Typography variant='caption' color='text.secondary'>
          {label}
        </Typography>
        <Typography variant='body1' component='div'>
          {value || '-'}
        </Typography>
      </Box>
    </Box>
  );

  const quoteColumns = [
    {
      field: 'quoteNumber',
      headerName: 'COT',
      width: 160,
      renderCell: (params: GridRenderCellParams<ClientQuoteHistory>) => (
        <Button
          variant='text'
          size='small'
          sx={{ p: 0, minWidth: 0, fontWeight: 'bold' }}
          onClick={() => navigate(`/quotes/${params.row.id}`)}
        >
          {params.value}
        </Button>
      ),
    },
    {
      field: 'quoteDate',
      headerName: 'Fecha',
      width: 150,
      valueGetter: (value: string) => formatDate(value),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 160,
      renderCell: (params: GridRenderCellParams<ClientQuoteHistory>) => (
        <QuoteStatusChip status={params.value as QuoteStatus} />
      ),
    },
    {
      field: 'total',
      headerName: 'Total',
      flex: 1,
      minWidth: 140,
      align: 'right' as const,
      headerAlign: 'right' as const,
      valueGetter: (value: number) => formatCurrency(value),
    },
  ];

  const orderColumns = [
    {
      field: 'orderNumber',
      headerName: 'OP',
      width: 160,
      renderCell: (params: GridRenderCellParams<ClientOrderHistory>) => (
        <Button
          variant='text'
          size='small'
          sx={{ p: 0, minWidth: 0, fontWeight: 'bold' }}
          onClick={() => navigate(`/orders/${params.row.id}`)}
        >
          {params.value}
        </Button>
      ),
    },
    {
      field: 'orderDate',
      headerName: 'Fecha',
      width: 150,
      valueGetter: (value: string) => formatDate(value),
    },

    {
      field: 'advisor',
      headerName: 'Asesor',
      flex: 1,
      minWidth: 160,
      valueGetter: (_: unknown, row: ClientOrderHistory) => {
        if (!row.advisor) return '-';
        const first = row.advisor.firstName || '';
        const last = row.advisor.lastName || '';
        return first || last ? `${first} ${last}`.trim() : row.advisor.email;
      },
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 150,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={ORDER_STATUS_LABELS[params.value] || params.value}
          size='small'
          color={ORDER_STATUS_COLORS[params.value] || 'default'}
        />
      ),
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 160,
      align: 'right' as const,
      headerAlign: 'right' as const,
      valueGetter: (value: number) => formatCurrency(value),
    },    
    {
      field: 'paidAmount',
      headerName: 'Abono',
      width: 140,
      align: 'right' as const,
      headerAlign: 'right' as const,
      valueGetter: (value: number) => formatCurrency(value),
    },
    {
      field: 'saldoACobrar',
      headerName: 'Saldo',
      width: 150,
      align: 'right' as const,
      headerAlign: 'right' as const,
      valueGetter: (_: unknown, row: ClientOrderHistory) =>
        formatCurrency(row.balance),
    },
    {
      field: 'balance',
      headerName: 'Pago',
      width: 170,
      renderCell: (params: GridRenderCellParams<ClientOrderHistory>) => {
        const isPaid = params.row.balance <= 0;
        return (
          <Chip
            label={isPaid ? 'Pagada' : 'Pendiente'}
            size='small'
            color={isPaid ? 'success' : 'warning'}
            variant={isPaid ? 'filled' : 'outlined'}
          />
        );
      },
    },
  ];

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title={client.name}
        subtitle='Estado de cuenta del cliente'
        breadcrumbs={[
          { label: 'Clientes', path: '/clients' },
          { label: client.name },
        ]}
      />

      <Grid container spacing={3}>
        {/* Main Information */}
        <Grid item xs={12} sm={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent='space-between'
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                mb={2}
                gap={1}
              >
                <Typography variant='h6'>Información del Cliente</Typography>
                <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                  {!isAdmin &&
                    hasPermission(PERMISSIONS.REQUEST_CLIENT_ADVISOR) && (
                      <RequestClientAdvisorButton
                        clientId={id || ''}
                        existingAdvisorIds={
                          client?.advisors?.map((a) => a.advisor.id) ?? []
                        }
                      />
                    )}
                  {hasPermission(PERMISSIONS.UPDATE_CLIENTS) && (
                    <Button
                      variant='outlined'
                      size='small'
                      startIcon={<EditIcon />}
                      onClick={() => navigate(`/clients/${id}/edit`)}
                    >
                      Editar
                    </Button>
                  )}
                </Stack>
              </Stack>

              <Divider sx={{ mb: 3 }} />

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <InfoItem
                    icon={<BusinessIcon fontSize='small' />}
                    label='Nombre'
                    value={client.name}
                  />

                  <InfoItem
                    icon={<PersonIcon fontSize='small' />}
                    label='Encargado / Gerente'
                    value={client.manager || 'No especificado'}
                  />

                  <InfoItem
                    icon={<EmailIcon fontSize='small' />}
                    label='Email'
                    value={client.email}
                  />

                  <InfoItem
                    icon={<PhoneIcon fontSize='small' />}
                    label='Teléfono'
                    value={
                      client.phone
                        ? (() => {
                            const { country, local } = parsePhoneValue(client.phone);
                            const waNumber = `${country.dialCode}${local}`;
                            return (
                              <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap'>
                                <Stack direction='row' spacing={0.75} alignItems='center'>
                                  <span title={country.name} style={{ fontSize: '1.1rem', lineHeight: 1 }}>
                                    {country.flag}
                                  </span>
                                  <span>+{country.dialCode} {local}</span>
                                </Stack>
                                <Tooltip title='Escribirle al cliente por WhatsApp'>
                                  <Button
                                    size='small'
                                    variant='outlined'
                                    href={`https://wa.me/${waNumber}`}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    startIcon={<WhatsAppIcon sx={{ fontSize: '1rem !important' }} />}
                                    sx={{
                                      borderColor: '#25D366',
                                      color: '#25D366',
                                      fontSize: '0.7rem',
                                      py: 0.25,
                                      px: 1,
                                      minHeight: 'unset',
                                      lineHeight: 1.5,
                                      '&:hover': {
                                        borderColor: '#128C7E',
                                        backgroundColor: 'rgba(37,211,102,0.08)',
                                        color: '#128C7E',
                                      },
                                    }}
                                  >
                                    Escribir
                                  </Button>
                                </Tooltip>
                              </Stack>
                            );
                          })()
                        : 'No especificado'
                    }
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <InfoItem
                    icon={<LocationOnIcon fontSize='small' />}
                    label='Dirección'
                    value={client.address || 'No especificada'}
                  />

                  <InfoItem
                    icon={<LocationOnIcon fontSize='small' />}
                    label='Ubicación'
                    value={
                      <Stack
                        direction='row'
                        spacing={1}
                        flexWrap='wrap'
                        useFlexGap
                      >
                        <Chip
                          label={client.city?.name || 'Sin ciudad'}
                          size='small'
                          variant='outlined'
                        />
                        <Chip
                          label={client.department?.name || 'Sin departamento'}
                          size='small'
                          color='primary'
                          variant='outlined'
                        />
                      </Stack>
                    }
                  />

                  <InfoItem
                    icon={<BadgeIcon fontSize='small' />}
                    label='Tipo de Persona'
                    value={
                      <Chip
                        label={
                          client.personType === 'EMPRESA'
                            ? 'Empresa'
                            : 'Persona Natural'
                        }
                        size='small'
                        color={
                          client.personType === 'EMPRESA'
                            ? 'primary'
                            : 'default'
                        }
                      />
                    }
                  />

                  {client.personType === 'EMPRESA' && (
                    <InfoItem
                      icon={<BadgeIcon fontSize='small' />}
                      label='NIT'
                      value={client.nit || 'No especificado'}
                    />
                  )}
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Status Card */}
        <Grid item xs={12} sm={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant='h6' gutterBottom>
                Estado
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Box sx={{ mb: 2 }}>
                <Typography variant='caption' color='text.secondary'>
                  Estado Actual
                </Typography>
                <Box mt={0.5}>
                  <Chip
                    label={client.isActive ? 'Activo' : 'Inactivo'}
                    size='small'
                    color={client.isActive ? 'success' : 'default'}
                  />
                </Box>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant='caption' color='text.secondary'>
                  Fecha de Creación
                </Typography>
                <Typography variant='body2'>
                  {new Date(client.createdAt).toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Typography>
              </Box>

              <Box>
                <Typography variant='caption' color='text.secondary'>
                  Última Actualización
                </Typography>
                <Typography variant='body2'>
                  {new Date(client.updatedAt).toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Special Condition Card */}
        {client.specialCondition && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Stack direction='row' alignItems='center' spacing={1} mb={1}>
                  <NoteIcon fontSize='small' color='warning' />
                  <Typography variant='h6'>Condición especial</Typography>
                </Stack>
                <Divider sx={{ mb: 2 }} />
                <Typography variant='body1' sx={{ whiteSpace: 'pre-wrap' }}>
                  {client.specialCondition}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
        {/* KPI Cards */}
        <Grid item xs={12} sm={12} md={12} container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            {statsLoading ? (
              <Skeleton
                variant='rectangular'
                height={100}
                sx={{ borderRadius: 1 }}
              />
            ) : (
              <KpiCard
                icon={<ShoppingCartIcon />}
                label='Total comprado'
                value={formatCurrency(stats?.totalPurchased ?? 0)}
                subtext={`${stats?.orders.length ?? 0} órdenes en total`}
              />
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            {statsLoading ? (
              <Skeleton
                variant='rectangular'
                height={100}
                sx={{ borderRadius: 1 }}
              />
            ) : (
              <KpiCard
                icon={<WarningAmberIcon />}
                label='OPs pendientes'
                value={formatCurrency(stats?.pendingBalance ?? 0)}
                subtext={
                  (stats?.pendingOrdersCount ?? 0) > 0
                    ? `${stats!.pendingOrdersCount} orden${stats!.pendingOrdersCount !== 1 ? 'es' : ''} por pagar`
                    : 'Sin deudas pendientes'
                }
                color={
                  (stats?.pendingBalance ?? 0) > 0 ? 'error.main' : undefined
                }
              />
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            {statsLoading ? (
              <Skeleton
                variant='rectangular'
                height={100}
                sx={{ borderRadius: 1 }}
              />
            ) : (
              <KpiCard
                icon={<AccountBalanceWalletIcon />}
                label='Saldo a favor del cliente'
                value={formatCurrency(stats?.saldoAFavor ?? 0)}
                subtext={
                  (stats?.saldoAFavor ?? 0) > 0
                    ? 'Disponible para aplicar'
                    : 'Sin saldo a favor'
                }
                color={
                  (stats?.saldoAFavor ?? 0) > 0 ? 'success.main' : undefined
                }
              />
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            {statsLoading ? (
              <Skeleton
                variant='rectangular'
                height={100}
                sx={{ borderRadius: 1 }}
              />
            ) : (() => {
              const lastOrder = stats?.orders?.[0] ?? null;
              return (
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack direction='row' alignItems='center' spacing={1.5} mb={1}>
                      <Box sx={{ color: 'primary.main' }}>
                        <CalendarTodayIcon />
                      </Box>
                      <Typography
                        variant='caption'
                        color='text.secondary'
                        sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                      >
                        Última compra
                      </Typography>
                    </Stack>
                    {lastOrder ? (
                      <>
                        <Typography variant='h5' fontWeight='bold'>
                          {formatDate(lastOrder.orderDate)}
                        </Typography>
                        <Stack direction='row' alignItems='center' spacing={1} mt={0.5}>
                          <Button
                            variant='text'
                            size='small'
                            sx={{ p: 0, minWidth: 0, fontWeight: 'bold', fontSize: '0.75rem' }}
                            onClick={() => navigate(`/orders/${lastOrder.id}`)}
                          >
                            {lastOrder.orderNumber}
                          </Button>
                          <Typography variant='caption' color='text.secondary'>
                            · {formatCurrency(lastOrder.total)}
                          </Typography>
                        </Stack>
                      </>
                    ) : (
                      <Typography variant='h5' fontWeight='bold'>
                        Sin compras
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </Grid>
        </Grid>
        {/* Orders History Table */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent='space-between'
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                mb={2}
                gap={1}
              >
                <Typography variant='h6'>Historial de Órdenes de Pedido</Typography>
                <ToggleButtonGroup
                  value={orderFilter}
                  exclusive
                  onChange={(_e, val) => {
                    if (val !== null) setOrderFilter(val);
                  }}
                  size='small'
                  sx={{
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    p: 0.5,
                    gap: 0.5,
                    '& .MuiToggleButton-root': {
                      border: 'none',
                      borderRadius: '6px !important',
                      px: 1.5,
                      py: 0.75,
                      textTransform: 'none',
                      fontWeight: 500,
                      fontSize: '0.8rem',
                      color: 'text.secondary',
                      gap: 0.75,
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                      },
                      '&.Mui-selected': {
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                        boxShadow: 1,
                        '&:hover': { bgcolor: 'background.paper' },
                      },
                      '&.Mui-selected[value="pending"]': {
                        color: 'warning.dark',
                      },
                      '&.Mui-selected[value="paid"]': {
                        color: 'success.dark',
                      },
                    },
                  }}
                >
                  <ToggleButton value='all'>
                    <AllInboxIcon sx={{ fontSize: 15 }} />
                    Todas
                    <Box
                      component='span'
                      sx={{
                        ml: 0.5,
                        px: 0.75,
                        py: 0.1,
                        borderRadius: 10,
                        bgcolor: orderFilter === 'all' ? 'grey.200' : 'transparent',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        lineHeight: 1.6,
                        color: 'text.secondary',
                      }}
                    >
                      {stats?.orders.length ?? 0}
                    </Box>
                  </ToggleButton>

                  <ToggleButton value='pending'>
                    <HourglassEmptyIcon sx={{ fontSize: 15 }} />
                    Pendientes
                    <Box
                      component='span'
                      sx={{
                        ml: 0.5,
                        px: 0.75,
                        py: 0.1,
                        borderRadius: 10,
                        bgcolor: orderFilter === 'pending' ? 'warning.100' : 'transparent',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        lineHeight: 1.6,
                        color: orderFilter === 'pending' ? 'warning.dark' : 'text.secondary',
                      }}
                    >
                      {stats?.orders.filter((o) => o.balance > 0).length ?? 0}
                    </Box>
                  </ToggleButton>

                  <ToggleButton value='paid'>
                    <CheckCircleIcon sx={{ fontSize: 15 }} />
                    Pagadas
                    <Box
                      component='span'
                      sx={{
                        ml: 0.5,
                        px: 0.75,
                        py: 0.1,
                        borderRadius: 10,
                        bgcolor: orderFilter === 'paid' ? 'success.100' : 'transparent',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        lineHeight: 1.6,
                        color: orderFilter === 'paid' ? 'success.dark' : 'text.secondary',
                      }}
                    >
                      {stats?.orders.filter((o) => o.balance <= 0).length ?? 0}
                    </Box>
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
              <Divider sx={{ mb: 2 }} />
              {orderGroups.length === 0 ? (
                <DataTable
                  rows={filteredOrders}
                  columns={orderColumns}
                  loading={statsLoading}
                  searchPlaceholder='Buscar en historial...'
                  density='compact'
                  pageSize={20}
                  pageSizeOptions={[20, 50, 100]}
                />
              ) : (
                <Stack spacing={3}>
                  {orderGroups.map((group) => (
                    <Box key={group.sede?.id ?? 'sin-sede'}>
                      <SedeGroupHeader
                        sede={group.sede}
                        count={group.rows.length}
                        unit='OP'
                        isActive={group.sede?.id === activeLocationId}
                        consulta={isConsultaSede(group.sede?.id)}
                      />
                      <DataTable
                        rows={group.rows}
                        columns={orderColumns}
                        loading={statsLoading}
                        toolbar={false}
                        density='compact'
                        pageSize={10}
                        pageSizeOptions={[10, 20, 50]}
                      />
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {quoteGroups.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant='h6' sx={{ mb: 2 }}>
                  Cotizaciones del cliente
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={3}>
                  {quoteGroups.map((group) => (
                    <Box key={group.sede?.id ?? 'sin-sede'}>
                      <SedeGroupHeader
                        sede={group.sede}
                        count={group.rows.length}
                        unit='COT'
                        isActive={group.sede?.id === activeLocationId}
                        consulta={isConsultaSede(group.sede?.id)}
                      />
                      <DataTable
                        rows={group.rows}
                        columns={quoteColumns}
                        toolbar={false}
                        density='compact'
                        pageSize={10}
                        pageSizeOptions={[10, 20, 50]}
                      />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default ClientDetailPage;
