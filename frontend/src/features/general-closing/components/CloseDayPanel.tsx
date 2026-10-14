import React from 'react';
import { Alert, AlertTitle, Box, Button, Link, Paper, Stack, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import type { ClosingBlocker, GeneralClosingDay } from '../../../types/general-closing.types';
import { discrepancyColor, discrepancyLabel, registerAnchor } from '../utils';
import { Figure } from './RegisterCard';

interface Props {
  day: GeneralClosingDay;
  signed: boolean;
  canPerform: boolean;
  canReopen: boolean;
  busy: boolean;
  onClose: () => void;
  onReopen: () => void;
}

/** Agrupa lo que falta por caja, en el orden de las tarjetas. */
const groupByRegister = (blockers: ClosingBlocker[]) => {
  const groups = new Map<string, { name: string; actions: string[] }>();
  for (const b of blockers) {
    const group = groups.get(b.cashRegisterId) ?? { name: b.cashRegisterName, actions: [] };
    group.actions.push(b.action);
    groups.set(b.cashRegisterId, group);
  }
  return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
};

const goToRegister = (cashRegisterId: string) =>
  document.getElementById(registerAnchor(cashRegisterId))?.scrollIntoView({ behavior: 'smooth' });

/**
 * El paso final del cierre: los totales de todas las cajas y, junto al botón,
 * lo que falta en cada caja para poder firmar, con un enlace para ir a ella.
 */
export const CloseDayPanel: React.FC<Props> = ({
  day,
  signed,
  canPerform,
  canReopen,
  busy,
  onClose,
  onReopen,
}) => {
  const { totals, blockers } = day;
  const groups = groupByRegister(blockers);
  const ready = blockers.length === 0;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Stack direction="row" spacing={2} rowGap={1.5} flexWrap="wrap" useFlexGap alignItems="flex-end">
        <Typography variant="subtitle2" sx={{ alignSelf: 'center', mr: 1 }}>
          Todas las cajas
        </Typography>
        <Figure label="Esperado" value={totals.expected} strong />
        <Figure label="Contado" value={totals.counted} strong />
        <Figure label="Diferencia" value={totals.discrepancy} strong color={discrepancyColor(totals.discrepancy)} />
        <Figure label="Transferencias" value={totals.incomeTransfer} />
        {totals.incomeCard > 0 && <Figure label="Tarjeta" value={totals.incomeCard} />}
      </Stack>
      {!signed && totals.discrepancy !== null && totals.discrepancy !== 0 && (
        <Typography variant="body2" sx={{ mt: 1, color: discrepancyColor(totals.discrepancy) }}>
          El día tiene {discrepancyLabel(totals.discrepancy).toLowerCase()} en efectivo.
        </Typography>
      )}

      {!signed && canPerform && (
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          sx={{ mt: 2 }}
        >
          <Alert severity={ready ? 'success' : 'warning'} sx={{ flex: 1 }}>
            {ready ? (
              <AlertTitle sx={{ mb: 0 }}>Todo listo: ya puedes cerrar el día</AlertTitle>
            ) : (
              <>
                <AlertTitle>Para cerrar el día falta</AlertTitle>
                <Stack spacing={1}>
                  {groups.map((group) => (
                    <Box key={group.id}>
                      <Stack direction="row" spacing={1} alignItems="baseline">
                        <Typography variant="body2" fontWeight={600}>
                          {group.name}
                        </Typography>
                        <Link
                          component="button"
                          variant="caption"
                          onClick={() => goToRegister(group.id)}
                        >
                          Ir a la caja
                        </Link>
                      </Stack>
                      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                        {group.actions.map((action) => (
                          <Typography component="li" variant="body2" key={action}>
                            {action}
                          </Typography>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
          </Alert>
          <Button
            variant="contained"
            size="large"
            startIcon={<LockIcon />}
            disabled={busy || !ready}
            onClick={onClose}
            sx={{ whiteSpace: 'nowrap', alignSelf: { md: 'center' } }}
          >
            Cerrar el día
          </Button>
        </Stack>
      )}

      {signed && canReopen && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button variant="outlined" color="warning" startIcon={<LockOpenIcon />} disabled={busy} onClick={onReopen}>
            Reabrir
          </Button>
        </Stack>
      )}
    </Paper>
  );
};
