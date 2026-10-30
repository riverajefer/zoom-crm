import {
  Box,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../../../utils/constants';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import {
  ExpenseOrderStatus,
  EXPENSE_ORDER_STATUS_CONFIG,
} from '../../../types/expense-order.types';
import { itemPaymentLabel } from '../../expense-orders/utils/itemPayment';
import type { AccountPayable } from '../../../types/accounts-payable.types';

interface Props {
  expenseOrder: NonNullable<AccountPayable['expenseOrder']>;
}

function StatusChip({ status }: { status: string }) {
  const config = EXPENSE_ORDER_STATUS_CONFIG[status as ExpenseOrderStatus];
  if (!config) return <Chip label={status} size="small" />;
  return <Chip label={config.label} size="small" color={config.color} />;
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={500}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

export const ExpenseOrderInfoSection: React.FC<Props> = ({ expenseOrder }) => {
  const createdByName =
    [expenseOrder.createdBy?.firstName, expenseOrder.createdBy?.lastName]
      .filter(Boolean)
      .join(' ') ||
    expenseOrder.createdBy?.email ||
    '—';

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" fontWeight={600}>
            Orden de Gasto vinculada
          </Typography>
          {expenseOrder.status && <StatusChip status={expenseOrder.status} />}
        </Stack>
        <Box
          component={RouterLink}
          to={ROUTES.EXPENSE_ORDERS_DETAIL?.replace(':id', expenseOrder.id) ?? '#'}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            color: 'primary.main',
            textDecoration: 'none',
            fontSize: '0.8rem',
            fontWeight: 600,
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {expenseOrder.ogNumber}
          <OpenInNewIcon sx={{ fontSize: 14 }} />
        </Box>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* Info general */}
      <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
        {expenseOrder.expenseType && (
          <InfoItem label="Tipo de gasto" value={expenseOrder.expenseType.name} />
        )}
        {expenseOrder.expenseSubcategory && (
          <InfoItem label="Subcategoría" value={expenseOrder.expenseSubcategory.name} />
        )}
        {expenseOrder.areaOrMachine && (
          <InfoItem label="Área / Máquina" value={expenseOrder.areaOrMachine} />
        )}
        {expenseOrder.createdAt && (
          <InfoItem label="Fecha de creación" value={formatDate(expenseOrder.createdAt)} />
        )}
        <InfoItem label="Creado por" value={createdByName} />
      </Stack>

      {expenseOrder.observations && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Observaciones
          </Typography>
          <Typography variant="body2">{expenseOrder.observations}</Typography>
        </Box>
      )}

      {/* Tabla de ítems */}
      {expenseOrder.items && expenseOrder.items.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Ítems del gasto
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ítem</TableCell>
                  <TableCell align="center">Cant.</TableCell>
                  <TableCell align="right">Precio unit.</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Método pago</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expenseOrder.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {item.name}
                      </Typography>
                      {item.description && (
                        <Typography variant="caption" color="text.secondary">
                          {item.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">{Number(item.quantity)}</TableCell>
                    <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatCurrency(item.total)}
                    </TableCell>
                    <TableCell>
                      {item.paymentMethod
                        ? itemPaymentLabel({ ...item, paymentMethod: item.paymentMethod })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </>
      )}
    </Box>
  );
};
