import React from 'react';
import {
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import type { LocationSupport } from '../../../types';
import { formatSupportRange, personName, supportKindLabel, supportStatus } from '../utils/locationSupport';

export interface LocationSupportAction {
  label: string;
  color?: 'primary' | 'error' | 'inherit';
  variant?: 'text' | 'outlined' | 'contained';
  onClick: (support: LocationSupport) => void;
}

interface Props {
  rows: LocationSupport[];
  /** Acciones por fila (aprobar, rechazar, terminar, cancelar…). */
  actions?: (support: LocationSupport) => LocationSupportAction[];
  /** La columna del empleado sobra en "Mis solicitudes". */
  showEmployee?: boolean;
  emptyText: string;
}

/** Tabla de apoyos en otra sede (docs/PLAN_SEDES.md §16). */
export const LocationSupportsTable: React.FC<Props> = ({ rows, actions, showEmployee = true, emptyText }) => {
  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        {emptyText}
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {showEmployee && <TableCell>Empleado</TableCell>}
            <TableCell>Sede</TableCell>
            <TableCell>Qué</TableCell>
            <TableCell>Fechas</TableCell>
            <TableCell>Motivo</TableCell>
            <TableCell>Pedido / autorizado</TableCell>
            <TableCell>Estado</TableCell>
            {actions && <TableCell align="right" />}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const status = supportStatus(row);
            const rowActions = actions?.(row) ?? [];
            return (
              <TableRow key={row.id} hover>
                {showEmployee && (
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {personName(row.user)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {row.user.username}
                    </Typography>
                  </TableCell>
                )}
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <SedeDot color={row.location.color} />
                    <span>{row.location.name}</span>
                  </Stack>
                  {row.replaces && (
                    <Typography variant="caption" color="text.secondary">
                      desde el apoyo en {row.replaces.location.name}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{supportKindLabel(row)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {row.kind === 'RETURN' ? '—' : formatSupportRange(row.startDate, row.endDate)}
                </TableCell>
                <TableCell sx={{ maxWidth: 260 }}>
                  <Typography variant="body2">{row.reason}</Typography>
                  {row.reviewNotes && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Gerencia: {row.reviewNotes}
                    </Typography>
                  )}
                  {row.endReason && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Terminado por {personName(row.endedBy)}: {row.endReason}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{personName(row.requestedBy)}</Typography>
                  {row.reviewedBy && row.reviewedBy.id !== row.requestedBy.id && (
                    <Typography variant="caption" color="text.secondary">
                      {row.status === 'REJECTED' ? 'rechazó' : 'autorizó'} {personName(row.reviewedBy)}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip size="small" label={status.label} color={status.color} />
                </TableCell>
                {actions && (
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      {rowActions.map((action) => (
                        <Button
                          key={action.label}
                          size="small"
                          color={action.color ?? 'primary'}
                          variant={action.variant ?? 'text'}
                          onClick={() => action.onClick(row)}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Box>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
