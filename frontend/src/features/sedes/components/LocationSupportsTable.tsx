import React from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { SedeDot } from '../../../components/layout/LocationSelector';
import type { LocationSupport } from '../../../types';
import {
  formatSupportMoment,
  formatSupportRange,
  personName,
  supportKindLabel,
  supportMoments,
  supportStatus,
} from '../utils/locationSupport';

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

const Sede: React.FC<{ row: LocationSupport }> = ({ row }) => (
  <Box>
    <Stack direction="row" spacing={1} alignItems="center">
      <SedeDot color={row.location.color} />
      <span>{row.location.name}</span>
    </Stack>
    {row.replaces && (
      <Typography variant="caption" color="text.secondary">
        desde el apoyo en {row.replaces.location.name}
      </Typography>
    )}
  </Box>
);

const dates = (row: LocationSupport) => (row.kind === 'RETURN' ? '—' : formatSupportRange(row.startDate, row.endDate));

/** Motivo, y lo que anotó Gerencia al revisar o al terminar. */
const Reason: React.FC<{ row: LocationSupport }> = ({ row }) => (
  <>
    <Typography variant="body2">{row.reason}</Typography>
    {row.reviewNotes && (
      <Typography variant="caption" color="text.secondary" display="block">
        Gerencia: {row.reviewNotes}
      </Typography>
    )}
    {row.endReason && (
      <Typography variant="caption" color="text.secondary" display="block">
        Terminado {row.endedAt && `el ${formatSupportMoment(row.endedAt)} `}por {personName(row.endedBy)}:{' '}
        {row.endReason}
      </Typography>
    )}
  </>
);

/** Fecha y hora de la solicitud y de la respuesta, y quién respondió. */
const Moments: React.FC<{ row: LocationSupport }> = ({ row }) => (
  <>
    {supportMoments(row).map((line) => (
      <Typography key={line} variant="caption" color="text.secondary" display="block">
        {line}
      </Typography>
    ))}
  </>
);

const Requested: React.FC<{ row: LocationSupport; withLabel?: boolean }> = ({ row, withLabel }) => (
  <>
    <Typography variant="body2">
      {withLabel ? 'Pedido por ' : ''}
      {personName(row.requestedBy)}
    </Typography>
    <Moments row={row} />
  </>
);

const Actions: React.FC<{ row: LocationSupport; actions: LocationSupportAction[]; fullWidth?: boolean }> = ({
  row,
  actions,
  fullWidth,
}) => (
  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
    {actions.map((action) => (
      <Button
        key={action.label}
        size="small"
        color={action.color ?? 'primary'}
        variant={action.variant ?? 'text'}
        onClick={() => action.onClick(row)}
        sx={{ whiteSpace: 'nowrap', ...(fullWidth && { flex: 1 }) }}
      >
        {action.label}
      </Button>
    ))}
  </Box>
);

/**
 * Apoyos en otra sede (docs/PLAN_SEDES.md §16). En pantallas angostas se
 * muestran como tarjetas, con las acciones al final: en una tabla quedaban
 * fuera de la pantalla.
 */
export const LocationSupportsTable: React.FC<Props> = ({ rows, actions, showEmployee = true, emptyText }) => {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'));

  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        {emptyText}
      </Typography>
    );
  }

  if (isNarrow) {
    return (
      <Stack divider={<Divider />}>
        {rows.map((row) => {
          const status = supportStatus(row);
          const rowActions = actions?.(row) ?? [];
          return (
            <Box key={row.id} sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  {showEmployee && (
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {personName(row.user)}{' '}
                      <Typography component="span" variant="caption" color="text.secondary">
                        {row.user.username}
                      </Typography>
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {supportKindLabel(row)} · {dates(row)}
                  </Typography>
                </Box>
                <Chip size="small" label={status.label} color={status.color} />
              </Stack>
              <Stack spacing={1}>
                <Sede row={row} />
                <Box>
                  <Reason row={row} />
                </Box>
                <Box>
                  <Requested row={row} withLabel />
                </Box>
                {rowActions.length > 0 && <Actions row={row} actions={rowActions} fullWidth />}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    );
  }

  // Las acciones quedan fijas a la derecha: si la tabla no cabe y hay que
  // desplazarla, los botones siguen a la vista (macOS esconde la barra).
  const stickySx = {
    position: 'sticky',
    right: 0,
    bgcolor: 'background.paper',
    boxShadow: `-8px 0 8px -8px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.15)'}`,
  } as const;

  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>{showEmployee ? 'Empleado' : 'Pedido por'}</TableCell>
            <TableCell>Sede</TableCell>
            <TableCell>Qué</TableCell>
            <TableCell>Motivo</TableCell>
            <TableCell>Estado</TableCell>
            {actions && <TableCell align="right" sx={stickySx} />}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const status = supportStatus(row);
            return (
              <TableRow key={row.id} hover>
                <TableCell>
                  {showEmployee && (
                    <>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {personName(row.user)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {row.user.username}
                        {row.requestedBy.id !== row.userId ? ` · pedido por ${personName(row.requestedBy)}` : ''}
                      </Typography>
                    </>
                  )}
                  {!showEmployee && <Typography variant="body2">{personName(row.requestedBy)}</Typography>}
                  <Moments row={row} />
                </TableCell>
                <TableCell>
                  <Sede row={row} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{supportKindLabel(row)}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {dates(row)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 280 }}>
                  <Reason row={row} />
                </TableCell>
                <TableCell>
                  <Chip size="small" label={status.label} color={status.color} />
                </TableCell>
                {actions && (
                  <TableCell align="right" sx={stickySx}>
                    <Actions row={row} actions={actions(row)} />
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
