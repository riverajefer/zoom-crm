import React, { useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  CircularProgress,
  Box,
  Typography,
  Chip,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
} from '@mui/material';
import {
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  Edit as EditIcon,
  DeleteForever as DeleteIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useRecordHistory } from '../../audit-logs/hooks/useAuditLogs';
import { AuditLog } from '../../../types';
import { ORDER_STATUS_CONFIG, PAYMENT_METHOD_LABELS } from '../../../types/order.types';

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

const formatCurrency = (value: unknown): string => {
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

const formatDateTime = (date: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

// ---------------------------------------------------------------------------
// Configuración de campos visibles por modelo
// ---------------------------------------------------------------------------

/** Campos que se muestran al usuario, por modelo Prisma */
const VISIBLE_FIELDS: Record<string, string[]> = {
  OrderItem: ['description', 'quantity', 'unitPrice'],
  Order:     ['status', 'notes', 'subtotal', 'tax', 'total', 'paidAmount', 'balance'],
  Payment:   ['amount', 'paymentMethod', 'reference'],
  RefundRequest: ['status', 'refundAmount', 'paymentMethod', 'observation', 'reviewNotes'],
};

/** Etiquetas legibles para cada campo */
const FIELD_LABELS: Record<string, string> = {
  description:  'Descripción',
  quantity:     'Cantidad',
  unitPrice:    'Precio unitario',
  status:       'Estado',
  notes:        'Observaciones',
  subtotal:     'Subtotal',
  tax:          'IVA',
  total:        'Total',
  paidAmount:   'Pagado',
  balance:      'Saldo',
  amount:       'Monto',
  paymentMethod:'Método de pago',
  reference:    'Referencia',
  refundAmount: 'Monto devolución',
  observation:  'Observación',
  reviewNotes:  'Notas de revisión',
};

/** Campos que se formatean como moneda COP */
const CURRENCY_FIELDS = new Set([
  'subtotal', 'tax', 'total', 'paidAmount', 'balance', 'unitPrice', 'amount', 'refundAmount',
]);

/**
 * Formatea un valor según el campo al que pertenece.
 */
const formatValue = (field: string, value: unknown): string => {
  if (value == null || value === '') return '—';
  if (CURRENCY_FIELDS.has(field)) return formatCurrency(value);
  if (field === 'status') {
    const cfg = ORDER_STATUS_CONFIG[value as keyof typeof ORDER_STATUS_CONFIG];
    return cfg?.label ?? String(value);
  }
  if (field === 'paymentMethod') {
    return PAYMENT_METHOD_LABELS[value as keyof typeof PAYMENT_METHOD_LABELS] ?? String(value);
  }
  return String(value);
};

// ---------------------------------------------------------------------------
// Agrupación de logs en "eventos"
// ---------------------------------------------------------------------------

interface ChangeEvent {
  /** Timestamp del primer log del grupo (para ordenar) */
  timestamp: string;
  /** Acción dominante del grupo */
  action: string;
  /** Usuario que generó el cambio */
  user: AuditLog['user'];
  /** Logs agrupados */
  logs: AuditLog[];
}

/**
 * Agrupa logs por ventana de tiempo (2 segundos).
 * Los logs que llegan de la misma transacción tienen createdAt muy cercanos.
 */
const groupLogsByEvent = (logs: AuditLog[]): ChangeEvent[] => {
  if (!logs.length) return [];

  // Ordenar por fecha ascendente
  const sorted = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const groups: ChangeEvent[] = [];
  let currentGroup: ChangeEvent = {
    timestamp: sorted[0].createdAt,
    action:    sorted[0].action,
    user:      sorted[0].user,
    logs:      [sorted[0]],
  };

  // Ventana deslizante: cada log se compara con el anterior (no con el inicio del grupo).
  // Esto agrupa correctamente logs de una misma transacción que pueden tardar > 2s en total.
  let previousLogTime = new Date(sorted[0].createdAt).getTime();

  for (let i = 1; i < sorted.length; i++) {
    const log     = sorted[i];
    const logTime = new Date(log.createdAt).getTime();

    if (logTime - previousLogTime <= 2000) {
      // Dentro de 2 segundos del log anterior → mismo evento
      currentGroup.logs.push(log);
      // Si hay un UPDATE en el grupo, ese es el dominante
      if (log.action === 'UPDATE') currentGroup.action = 'UPDATE';
    } else {
      // Gap > 2s → cerrar grupo anterior y abrir nuevo
      groups.push(currentGroup);
      currentGroup = {
        timestamp: log.createdAt,
        action:    log.action,
        user:      log.user,
        logs:      [log],
      };
    }
    previousLogTime = logTime;
  }
  groups.push(currentGroup);

  // Retornar de más reciente a más antiguo
  return groups.reverse();
};

// ---------------------------------------------------------------------------
// Extrae los cambios campo a campo de un grupo de logs
// ---------------------------------------------------------------------------

interface FieldChange {
  label: string;
  oldValue: string;
  newValue: string;
  model: string;
  recordId?: string;        // ID del registro (para agrupar cambios de un mismo item)
  itemDescription?: string; // Descripción del item (se muestra como sub-header)
}

/** Verifica que un valor sea primitivo (no objeto ni array) */
const isPrimitive = (value: unknown): boolean =>
  value == null || typeof value !== 'object';

/**
 * Construye un mapa itemId → descripción escaneando todos los logs.
 * CREATE y DELETE logs contienen la descripción en sus datos; los usamos como referencia
 * para identificar items en logs UPDATE donde la descripción no cambió.
 */
const buildItemDescriptions = (logs: AuditLog[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const log of logs) {
    // 1. Logs directos de OrderItem
    if (log.model === 'OrderItem' && log.recordId) {
      const desc =
        (log.newData as Record<string, unknown>)?.description ||
        (log.oldData as Record<string, unknown>)?.description;
      if (typeof desc === 'string' && desc) {
        map.set(log.recordId, desc);
      }
    }
    // 2. Logs de Order que contienen items en sus datos (como los generados por logOrderChange)
    const possibleItems =
      (log.newData as Record<string, unknown>)?.items ||
      (log.oldData as Record<string, unknown>)?.items;

    if (Array.isArray(possibleItems)) {
      for (const item of possibleItems) {
        if (item && typeof item === 'object' && item.id && item.description) {
          map.set(String(item.id), String(item.description));
        }
      }
    }
  }
  return map;
};

const extractChanges = (event: ChangeEvent, itemDescriptions: Map<string, string>): FieldChange[] => {
  const changes: FieldChange[] = [];
  /** Conjunto para deduplicar cambios dentro del mismo evento */
  const seen = new Set<string>();

  const addChange = (change: FieldChange) => {
    const key = `${change.model}|${change.label}|${change.oldValue}|${change.newValue}`;
    if (seen.has(key)) return; // Evitar duplicados (log automático + manual)
    seen.add(key);
    changes.push(change);
  };

  for (const log of event.logs) {
    const visibleFields = VISIBLE_FIELDS[log.model];
    if (!visibleFields) continue;

    // Para OrderItem: adjuntar recordId + descripción del item
    const itemExtras = log.model === 'OrderItem' && log.recordId
      ? {
          recordId:        log.recordId,
          itemDescription: itemDescriptions.get(log.recordId),
        }
      : {};

    if (log.action === 'UPDATE' && log.oldData && log.newData) {
      for (const field of visibleFields) {
        const oldVal = (log.oldData as Record<string, unknown>)[field];
        const newVal = (log.newData as Record<string, unknown>)[field];
        // Ignorar valores que sean objetos/arrays (datos internos)
        if (!isPrimitive(oldVal) || !isPrimitive(newVal)) continue;
        // Solo si efectivamente cambió
        if (String(oldVal) !== String(newVal)) {
          addChange({
            label:    FIELD_LABELS[field] ?? field,
            // Si el valor es null/undefined → string vacío para que ChangeRow muestre "nuevo"/"eliminado"
            oldValue: oldVal != null && oldVal !== '' ? formatValue(field, oldVal) : '',
            newValue: newVal != null && newVal !== '' ? formatValue(field, newVal) : '',
            model:    log.model,
            ...itemExtras,
          });
        }
      }
    } else if (log.action === 'CREATE' && log.newData) {
      // Para creaciones mostrar los campos relevantes como "nuevo valor"
      for (const field of visibleFields) {
        const newVal = (log.newData as Record<string, unknown>)[field];
        if (!isPrimitive(newVal)) continue;
        if (newVal != null && newVal !== '') {
          addChange({
            label:    FIELD_LABELS[field] ?? field,
            oldValue: '',
            newValue: formatValue(field, newVal),
            model:    log.model,
            ...itemExtras,
          });
        }
      }
    } else if (log.action === 'DELETE' && log.oldData) {
      for (const field of visibleFields) {
        const oldVal = (log.oldData as Record<string, unknown>)[field];
        if (!isPrimitive(oldVal)) continue;
        if (oldVal != null && oldVal !== '') {
          addChange({
            label:    FIELD_LABELS[field] ?? field,
            oldValue: formatValue(field, oldVal),
            newValue: '',
            model:    log.model,
            ...itemExtras,
          });
        }
      }
    }
  }

  return changes;
};

// ---------------------------------------------------------------------------
// Título del evento según los modelos presentes
// ---------------------------------------------------------------------------

const getEventTitle = (event: ChangeEvent): string => {
  const models = new Set(event.logs.map((l) => l.model));

  if (event.action === 'CREATE') {
    if (models.has('Order')) return 'Orden creada';
    if (models.has('OrderItem')) return 'Item agregado';
    if (models.has('Payment')) return 'Pago registrado';
    return 'Registro creado';
  }

  if (event.action === 'DELETE') {
    if (models.has('OrderItem')) return 'Item eliminado';
    if (models.has('Order')) return 'Orden eliminada';
    return 'Registro eliminado';
  }

  // UPDATE
  if (models.has('OrderItem')) return 'Items de la orden actualizados';
  if (models.has('Payment'))   return 'Pago actualizado';
  if (models.has('Order'))     return 'Orden actualizada';
  return 'Actualización';
};

// ---------------------------------------------------------------------------
// Configuración visual por acción
// ---------------------------------------------------------------------------

const ACTION_CONFIG: Record<string, {
  color: 'success' | 'info' | 'error';
  label: string;
  icon: React.ReactElement;
  dotBg: string;
}> = {
  CREATE: {
    color: 'success',
    label: 'Creación',
    icon: <CheckCircleIcon fontSize="small" />,
    dotBg: '#4caf50',
  },
  UPDATE: {
    color: 'info',
    label: 'Actualización',
    icon: <EditIcon fontSize="small" />,
    dotBg: '#A3D33C',       // primary.main del tema
  },
  DELETE: {
    color: 'error',
    label: 'Eliminación',
    icon: <DeleteIcon fontSize="small" />,
    dotBg: '#f44336',
  },
};

// ---------------------------------------------------------------------------
// Componentes de presentación
// ---------------------------------------------------------------------------

/** Línea vertical del timeline */
const TimelineLine: React.FC<{ isLast: boolean }> = ({ isLast }) => (
  <Box
    sx={{
      width: 2,
      flex: isLast ? 0 : 1,
      minHeight: isLast ? 0 : 24,
      backgroundColor: 'divider',
    }}
  />
);

/** Punto del timeline con icono */
const TimelineDot: React.FC<{ action: string }> = ({ action }) => {
  const cfg = ACTION_CONFIG[action] ?? ACTION_CONFIG.UPDATE;
  return (
    <Avatar
      className="timeline-dot"
      sx={{
        width: 32,
        height: 32,
        backgroundColor: cfg.dotBg,
        color: '#fff',
        boxShadow: (theme) => theme.palette.mode === 'dark' 
          ? '0 0 10px rgba(0,0,0,0.5)' 
          : '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 1,
        flexShrink: 0,
        transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}
    >
      {cfg.icon}
    </Avatar>
  );
};

/** Una tabla para mostrar los cambios de un grupo de campos */
const ChangesTable: React.FC<{ changes: FieldChange[] }> = ({ changes }) => (
  <TableContainer sx={{ border: 'none', boxShadow: 'none', backgroundColor: 'transparent', overflow: 'hidden' }}>
    <Table size="small">
      <TableHead sx={{ backgroundColor: (theme) => 
          theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'grey.50' }}>
        <TableRow sx={{ '& th': { borderBottom: '1px solid', borderColor: 'divider', fontWeight: 600, py: 0.5, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' } }}>
          <TableCell sx={{ color: 'text.secondary', width: '30%' }}>Campo</TableCell>
          <TableCell sx={{ color: 'text.secondary', width: '32%', textAlign: 'center' }}>Antes</TableCell>
          <TableCell sx={{ color: 'text.secondary', width: '6%', textAlign: 'center' }}></TableCell>
          <TableCell sx={{ color: 'text.secondary', width: '32%', textAlign: 'center' }}>Ahora</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {changes.map((change, index) => (
          <TableRow 
            key={index} 
            sx={{ 
              '& td': { borderBottom: index === changes.length - 1 ? 'none' : '1px solid', borderColor: 'divider', py: 0.75 },
              '&:hover': { backgroundColor: 'action.hover' }
            }}
          >
            {/* Etiqueta del campo */}
            <TableCell sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.8125rem' }}>
              {change.label}
            </TableCell>

            {/* Valor anterior */}
            <TableCell align="center">
              {change.oldValue ? (
                <Chip
                  label={change.oldValue}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.75rem',
                    borderColor: (theme) => 
                      theme.palette.mode === 'dark' ? 'rgba(231, 76, 60, 0.3)' : 'error.light',
                    color: (theme) => 
                      theme.palette.mode === 'dark' ? '#ff8a80' : 'error.main',
                    fontWeight: 500,
                    maxWidth: 200,
                  }}
                />
              ) : (
                <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}>
                  —
                </Typography>
              )}
            </TableCell>

            {/* Flecha */}
            <TableCell align="center" sx={{ px: 0 }}>
              <ArrowForwardIcon sx={{ color: 'text.disabled', fontSize: '0.9rem', verticalAlign: 'middle' }} />
            </TableCell>

            {/* Valor nuevo */}
            <TableCell align="center">
              {change.newValue ? (
                <Chip
                  label={change.newValue}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.75rem',
                    backgroundColor: (theme) => 
                      theme.palette.mode === 'dark' ? 'rgba(46, 204, 113, 0.15)' : 'success.light',
                    color: (theme) => 
                      theme.palette.mode === 'dark' ? '#b9f6ca' : 'success.contrastText',
                    fontWeight: 500,
                    maxWidth: 200,
                    border: 'none',
                  }}
                />
              ) : (
                <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}>
                  eliminado
                </Typography>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface OrderChangeHistoryTabProps {
  orderId: string;
  orderNumber?: string;
}

export const OrderChangeHistoryTab: React.FC<OrderChangeHistoryTabProps> = ({
  orderId,
  orderNumber,
}) => {
  const { data: auditLogs, isLoading, isError } = useRecordHistory(orderId);

  const events = useMemo(() => {
    if (!auditLogs) return [];
    const grouped = groupLogsByEvent(auditLogs);
    // No mostrar el evento de creación inicial de la orden
    return grouped.filter((event) => {
      const isOrderCreate =
        event.action === 'CREATE' && event.logs.some((l) => l.model === 'Order');
      return !isOrderCreate;
    });
  }, [auditLogs]);

  /** Mapa itemId → descripción, escaneado de todos los logs */
  const itemDescriptions = useMemo(
    () => (auditLogs ? buildItemDescriptions(auditLogs) : new Map<string, string>()),
    [auditLogs],
  );

  // ---------------------------------------------------------------------------
  // Estados de carga / error / vacío
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent>
          <Typography color="error" textAlign="center" py={3}>
            Error al cargar el historial de cambios
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (!events.length) {
    return (
      <Card>
        <CardHeader
          title="Historial de Cambios"
          subheader="Registro completo de modificaciones realizadas a esta orden"
        />
        <CardContent>
          <Typography color="text.secondary" textAlign="center" py={3}>
            No hay cambios registrados para esta orden
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Render del timeline
  // ---------------------------------------------------------------------------

  return (
    <Card>
      <CardHeader
        title={`Historial de Cambios: ${orderNumber ? `${orderNumber}` : ''}`}
        subheader={`Registro completo de modificaciones realizadas a esta orden (${events.length})`}
      />
      <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {events.map((event, index) => {
            const isLast    = index === events.length - 1;
            const cfg       = ACTION_CONFIG[event.action] ?? ACTION_CONFIG.UPDATE;
            const changes   = extractChanges(event, itemDescriptions);
            const userName  = event.user
              ? `${event.user.firstName || ''} ${event.user.lastName || ''}`.trim() || event.user.email
              : 'Sistema';

            return (
              <Box 
                key={index} 
                sx={{ 
                  display: 'flex', 
                  gap: 2,
                  '&:hover .timeline-dot': { transform: 'scale(1.15)' }
                }}
              >
                {/* Columna izquierda: línea + punto */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
                  <TimelineLine isLast={index === 0} />
                  <TimelineDot action={event.action} />
                  <TimelineLine isLast={isLast} />
                </Box>

                {/* Columna derecha: contenido */}
                <Box sx={{ flex: 1, pb: isLast ? 0 : 5, minWidth: 0 }}>
                  {/* Header: usuario + fecha + chip acción */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      flexWrap: 'wrap',
                      py: 0.75,
                      px: 1,
                      borderRadius: 1.5,
                      backgroundColor: (theme) => 
                        theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0,0,0,0.01)',
                      mb: 1
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PersonIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {userName}
                      </Typography>
                    </Box>
                    
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
                      {formatDateTime(event.timestamp)}
                    </Typography>

                    <Chip
                      label={getEventTitle(event)}
                      color={cfg.color}
                      size="small"
                      sx={{ 
                        fontWeight: 700, 
                        height: 22, 
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        px: 0.5,
                        ml: 'auto' // Empuja el chip a la derecha si hay espacio
                      }}
                    />
                  </Box>

                  {/* Contenedor de cambios */}
                  <Box sx={{ mt: 1, ml: 1 }}>
                    {changes.length > 0 ? (() => {
                      const itemGroups = new Map<string, FieldChange[]>();
                      const otherChanges: FieldChange[] = [];

                      for (const change of changes) {
                        if (change.model === 'OrderItem' && change.recordId) {
                          const group = itemGroups.get(change.recordId) ?? [];
                          group.push(change);
                          itemGroups.set(change.recordId, group);
                        } else {
                          otherChanges.push(change);
                        }
                      }

                      return (
                        <Box>
                          {/* Primero: grupos de items */}
                          {Array.from(itemGroups.entries()).map(([recId, itemChanges]) => (
                            <Box key={recId} sx={{ mb: 2.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ml: -0.5 }}>
                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'info.main' }} />
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.8rem', letterSpacing: '0.2px' }}>
                                  {itemChanges[0].itemDescription || 
                                   itemChanges.find(c => c.label === 'Descripción')?.oldValue ||
                                   itemChanges.find(c => c.label === 'Descripción')?.newValue ||
                                   'Item'}
                                </Typography>
                              </Box>
                              <ChangesTable changes={itemChanges} />
                            </Box>
                          ))}

                          {/* Luego: cambios de Order / Payment */}
                          {otherChanges.length > 0 && (
                            <Box sx={{ mt: itemGroups.size > 0 ? 3 : 0 }}>
                              <ChangesTable changes={otherChanges} />
                            </Box>
                          )}
                        </Box>
                      );
                    })() : (
                      <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', ml: 1 }}>
                        {event.action === 'CREATE' ? 'Registro creado.' : event.action === 'DELETE' ? 'Registro eliminado.' : 'Modificación realizada.'}
                      </Typography>
                    )}
                  </Box>

                  {/* Divisor Visual entre eventos */}
                  {!isLast && (
                    <Divider sx={{ mt: 4, mb: 0, opacity: 0.4 }} />
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
};
