import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { PageHeader } from '../../../components/common/PageHeader';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { SedeDot } from '../../../components/layout/LocationSelector';
import { Sede } from '../../../types';
import { useManageSedes } from '../hooks/useSedes';
import { SedeFormDialog } from '../components/SedeFormDialog';

/**
 * Administración de sedes. **No está en el menú**: se entra por URL y solo con
 * el permiso reservado `manage_locations` (soporte). Ver docs/PLAN_SEDES.md §6.4.
 */
const SedesAdminPage: React.FC = () => {
  const { sedesQuery } = useManageSedes();
  const [editing, setEditing] = useState<Sede | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openDialog = (sede: Sede | null) => {
    setEditing(sede);
    setDialogOpen(true);
  };

  if (sedesQuery.isLoading) return <LoadingSpinner />;
  const sedes = sedesQuery.data ?? [];

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Sedes"
        subtitle="Solo soporte. Esta página no aparece en el menú."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog(null)}>
            Nueva sede
          </Button>
        }
      />
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Sede</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Dirección</TableCell>
                <TableCell>Teléfono</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {sedes.map((sede) => (
                <TableRow key={sede.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{sede.code}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SedeDot color={sede.color} size={12} />
                      {sede.name}
                    </Box>
                  </TableCell>
                  <TableCell>{sede.type === 'HEADQUARTERS' ? 'Matriz' : 'Local'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color={sede.address ? 'text.primary' : 'text.secondary'}>
                      {sede.address ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>{sede.phone ?? '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={sede.isActive ? 'Activa' : 'Inactiva'} color={sede.isActive ? 'success' : 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => openDialog(sede)} aria-label={`Editar ${sede.name}`}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <SedeFormDialog open={dialogOpen} sede={editing} onClose={() => setDialogOpen(false)} />
    </Box>
  );
};

export default SedesAdminPage;
