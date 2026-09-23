import React, { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
  Grid,
  alpha,
  useTheme,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { GridRenderCellParams } from '@mui/x-data-grid';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EditIcon from '@mui/icons-material/Edit';
import InfoIcon from '@mui/icons-material/Info';
import PublicIcon from '@mui/icons-material/Public';
import ComputerIcon from '@mui/icons-material/Computer';
import RouterIcon from '@mui/icons-material/Router';
import WebIcon from '@mui/icons-material/Web';
import LanguageIcon from '@mui/icons-material/Language';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable } from '../../../components/common/DataTable';
import { useAttendance } from '../hooks/useAttendance';
import { useAuthStore } from '../../../store/authStore';
import { PERMISSIONS } from '../../../utils/constants';
import {
  AttendanceRecord,
  AttendanceSource,
  AdjustAttendanceDto,
} from '../../../types';
import { useResponsiveColumns, type ResponsiveGridColDef } from '../../../hooks';
import { LoadingButton } from '../../../components/common/LoadingButton';

/**
 * Formatea una fecha ISO (Solo Fecha)
 */
const formatJustDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

/**
 * Formatea una fecha ISO (Solo Hora)
 */
const formatJustTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Formatea minutos en "Xh Ym"
 */
const formatMinutes = (mins?: number | null): string => {
  if (!mins && mins !== 0) return '—';
  if (mins < 1) return '< 1m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

/**
 * Color del badge según source
 */
const sourceBadgeColor = (source: AttendanceSource) => {
  switch (source) {
    case 'BUTTON': return 'success';
    case 'INACTIVITY': return 'warning';
    case 'LOGOUT': return 'info';
    case 'SYSTEM': return 'error';
    default: return 'default';
  }
};

/**
 * Etiqueta del source en español
 */
const sourceLabel = (source: AttendanceSource, type: string) => {
  switch (source) {
    case 'BUTTON': return type === 'MANUAL' ? 'Manual' : 'Manual';
    case 'INACTIVITY': return 'Inactividad';
    case 'LOGOUT': return 'Logout';
    case 'SYSTEM': return 'Sistema';
    default: return source;
  }
};

const AttendancePage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission(PERMISSIONS.MANAGE_ATTENDANCE);

  const { recordsQuery, adjustMutation, filters, updateFilters } = useAttendance();
  const records: AttendanceRecord[] = recordsQuery.data?.data || [];

  // ── Estado para el diálogo de ajuste ──
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [adjustForm, setAdjustForm] = useState<AdjustAttendanceDto>({ reason: '' });

  const handleOpenAdjust = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setAdjustForm({
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      notes: record.notes || '',
      reason: '',
    });
    setAdjustOpen(true);
  };

  const handleConfirmAdjust = () => {
    if (!selectedRecord) return;
    adjustMutation.mutate(
      { id: selectedRecord.id, dto: adjustForm },
      { onSuccess: () => setAdjustOpen(false) }
    );
  };

  // ── Estado para el diálogo de metadata ──
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [selectedMetadata, setSelectedMetadata] = useState<any>(null);

  const handleOpenMetadata = (metadata: any) => {
    setSelectedMetadata(metadata);
    setMetadataOpen(true);
  };

  // ── Resumen: total horas del día y semana ──
  const summary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    let todayMins = 0;
    let weekMins = 0;

    for (const r of records) {
      const clockInDate = new Date(r.clockIn);
      const mins = r.totalMinutes || 0;
      if (clockInDate >= today) todayMins += mins;
      if (clockInDate >= weekAgo) weekMins += mins;
    }

    return { todayMins, weekMins };
  }, [records]);

  // ── Columnas ──
  const rawColumns: ResponsiveGridColDef[] = useMemo(() => [
    {
      field: 'user',
      headerName: 'Usuario',
      flex: 1,
      minWidth: 160,
      renderCell: (params: GridRenderCellParams<AttendanceRecord>) => {
        const u = params.row.user;
        const name = u?.firstName && u?.lastName
          ? `${u.firstName} ${u.lastName}`
          : (u?.email || '—');
        return (
          <Typography variant="body2" fontWeight={500}>
            {name}
          </Typography>
        );
      },
    },
    {
      field: 'phone',
      headerName: 'Celular',
      flex: 1,
      minWidth: 150,
      responsive: 'md',
      valueGetter: (_v: any, row: AttendanceRecord) => row.user?.phone || '—',
    },
    {
      field: 'productionArea',
      headerName: 'Área de Producción',
      width: 160,
      responsive: 'md',
      valueGetter: (_v: any, row: AttendanceRecord) => row.user?.cargo?.productionArea?.name || '—',
    },
    {
      field: 'cargo',
      headerName: 'Cargo',
      width: 130,
      responsive: 'md',
      valueGetter: (_v: any, row: AttendanceRecord) => row.user?.cargo?.name || '—',
    },
    {
      field: 'clockIn',
      headerName: 'Entrada',
      width: 140,
      responsive: 'sm',
      renderCell: (params: GridRenderCellParams<AttendanceRecord>) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', height: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {formatJustTime(params.row.clockIn)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
            {formatJustDate(params.row.clockIn)}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'clockOut',
      headerName: 'Salida',
      width: 140,
      responsive: 'sm',
      renderCell: (params: GridRenderCellParams<AttendanceRecord>) => {
        if (!params.row.clockOut) {
          return <Typography variant="body2" color="warning.main" sx={{ fontWeight: 500 }}>En curso</Typography>;
        }
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {formatJustTime(params.row.clockOut)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
              {formatJustDate(params.row.clockOut)}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'totalMinutes',
      headerName: 'Tiempo',
      width: 110,
      align: 'center',
      headerAlign: 'center',
      responsive: 'sm',
      renderCell: (params: GridRenderCellParams<AttendanceRecord>) => (
        <Chip
          icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
          label={formatMinutes(params.row.totalMinutes)}
          size="small"
          color={params.row.clockOut ? 'default' : 'info'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'source',
      headerName: 'Tipo',
      width: 110,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params: GridRenderCellParams<AttendanceRecord>) => (
        <Chip
          label={sourceLabel(params.row.source, params.row.type)}
          color={sourceBadgeColor(params.row.source) as any}
          size="small"
        />
      ),
    },
    ...(canManage
      ? [{
          field: 'actions',
          headerName: 'Acciones',
          width: 130,
          align: 'center' as const,
          headerAlign: 'center' as const,
          sortable: false,
          renderCell: (params: GridRenderCellParams<AttendanceRecord>) => {
            const hasMetadata = params.row.metadata && Object.keys(params.row.metadata).length > 0;
            return (
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', width: '100%' }}>
              <Tooltip title={hasMetadata ? "Ver detalles de conexión" : "Sin detalles de conexión"}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => handleOpenMetadata(params.row.metadata)}
                    disabled={!hasMetadata}
                  >
                    <InfoIcon sx={{ fontSize: 18 }} color={hasMetadata ? "info" : "disabled"} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Ajustar registro">
                <Button
                  size="small"
                  startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                  onClick={() => handleOpenAdjust(params.row)}
                  sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
                >
                  Ajustar
                </Button>
              </Tooltip>
            </Box>
          )},
        }]
      : []),
  ], [canManage]);

  const columns = useResponsiveColumns(rawColumns);

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="Control de Asistencia"
        subtitle="Registros de entrada y salida de los usuarios"
      />

      {/* Resumen de horas */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Paper
            sx={{
              p: 2,
              borderRadius: 2,
              background: isDark
                ? alpha('#00e5ff', 0.07)
                : alpha(theme.palette.success.main, 0.06),
              border: `1px solid ${isDark
                ? alpha('#00e5ff', 0.2)
                : alpha(theme.palette.success.main, 0.2)}`,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Hoy (total registros)
            </Typography>
            <Typography variant="h6" fontWeight={700} color={isDark ? '#00e5ff' : 'success.main'}>
              {formatMinutes(summary.todayMins)}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper
            sx={{
              p: 2,
              borderRadius: 2,
              background: isDark
                ? alpha('#7c4dff', 0.07)
                : alpha(theme.palette.primary.main, 0.06),
              border: `1px solid ${isDark
                ? alpha('#7c4dff', 0.2)
                : alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Últimos 7 días
            </Typography>
            <Typography variant="h6" fontWeight={700} color={isDark ? '#7c4dff' : 'primary.main'}>
              {formatMinutes(summary.weekMins)}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <DataTable
        density="compact"
        rows={records}
        columns={columns}
        loading={recordsQuery.isLoading || recordsQuery.isFetching}
        rowCount={recordsQuery.data?.meta?.total ?? 0}
        currentPage={(filters.page ?? 1) - 1}
        pageSize={filters.limit ?? 20}
        pageSizeOptions={[20, 50, 100]}
        onPaginationModelChange={(model) =>
          updateFilters({ page: model.page + 1, limit: model.pageSize })
        }
        searchPlaceholder="Buscar registros de asistencia..."
        emptyMessage="No se encontraron registros de asistencia"
      />

      {/* Dialog de ajuste */}
      <Dialog
        open={adjustOpen}
        onClose={() => !adjustMutation.isPending && setAdjustOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            background: isDark
              ? 'linear-gradient(135deg, #161816 0%, #1F221E 100%)'
              : undefined,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>Ajustar Registro de Asistencia</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ajusta los horarios del registro. La justificación es obligatoria.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Hora de Entrada"
              type="datetime-local"
              value={adjustForm.clockIn ? adjustForm.clockIn.slice(0, 16) : ''}
              onChange={(e) =>
                setAdjustForm((f) => ({
                  ...f,
                  clockIn: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Hora de Salida (opcional)"
              type="datetime-local"
              value={adjustForm.clockOut ? adjustForm.clockOut.slice(0, 16) : ''}
              onChange={(e) =>
                setAdjustForm((f) => ({
                  ...f,
                  clockOut: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Notas"
              multiline
              rows={2}
              value={adjustForm.notes || ''}
              onChange={(e) => setAdjustForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Justificación del ajuste *"
              multiline
              rows={2}
              required
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
              fullWidth
              helperText="Describe el motivo del ajuste"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setAdjustOpen(false)}
            disabled={adjustMutation.isPending}
          >
            Cancelar
          </Button>
          <LoadingButton
            variant="contained"
            onClick={handleConfirmAdjust}
            loading={adjustMutation.isPending}
            disabled={!adjustForm.reason.trim()}
          >
            Guardar Ajuste
          </LoadingButton>
        </DialogActions>
      </Dialog>

      {/* Dialog de metadata */}
      <Dialog
        open={metadataOpen}
        onClose={() => setMetadataOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            background: isDark
              ? 'linear-gradient(135deg, #161816 0%, #1F221E 100%)'
              : undefined,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>Detalles de Conexión</DialogTitle>
        <DialogContent>
          {selectedMetadata && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, ml: 1 }}>
                  Ubicación y Red
                </Typography>
                <Paper variant="outlined" sx={{ borderRadius: 2, mt: 1, overflow: 'hidden', borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1) }}>
                  <List disablePadding>
                    <ListItem divider>
                      <ListItemIcon sx={{ minWidth: 40 }}><RouterIcon color="primary" /></ListItemIcon>
                      <ListItemText 
                        primary="Dirección IP" 
                        secondary={selectedMetadata.ipAddress || 'Desconocida'} 
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                    <ListItem divider={!!selectedMetadata.location}>
                      <ListItemIcon sx={{ minWidth: 40 }}><PublicIcon color="primary" /></ListItemIcon>
                      <ListItemText 
                        primary="Ubicación por IP (Aproximada)" 
                        secondary={selectedMetadata.geoIp ? `${selectedMetadata.geoIp.city}, ${selectedMetadata.geoIp.country}` : 'Desconocida'} 
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                    {selectedMetadata.location && (
                      <ListItem sx={{ flexDirection: 'column', alignItems: 'stretch', py: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, width: '100%' }}>
                          <ListItemIcon sx={{ minWidth: 40 }}><LocationOnIcon color="error" /></ListItemIcon>
                          <ListItemText 
                            primary="Ubicación GPS (Precisa)" 
                            secondary={`Lat: ${selectedMetadata.location.latitude.toFixed(5)} | Lng: ${selectedMetadata.location.longitude.toFixed(5)} (±${Math.round(selectedMetadata.location.accuracy)}m)`} 
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                            secondaryTypographyProps={{ variant: 'body2' }}
                            sx={{ m: 0 }}
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            color="primary"
                            component="a"
                            href={`https://maps.google.com/?q=${selectedMetadata.location.latitude},${selectedMetadata.location.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ ml: 1, whiteSpace: 'nowrap', textTransform: 'none', borderRadius: 2 }}
                          >
                            Abrir Mapa
                          </Button>
                        </Box>
                        <Box 
                          component="iframe"
                          src={`https://maps.google.com/maps?q=${selectedMetadata.location.latitude},${selectedMetadata.location.longitude}&z=15&output=embed`}
                          width="100%"
                          height="220"
                          sx={{ 
                            border: `1px solid ${isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1)}`, 
                            borderRadius: 2,
                            backgroundColor: isDark ? alpha('#000', 0.2) : alpha('#000', 0.05) 
                          }}
                          title="Ubicación GPS"
                          loading="lazy"
                        />
                      </ListItem>
                    )}
                  </List>
                </Paper>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, ml: 1 }}>
                  Dispositivo y Navegador
                </Typography>
                <Paper variant="outlined" sx={{ borderRadius: 2, mt: 1, overflow: 'hidden', borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1) }}>
                  <List disablePadding>
                    <ListItem divider>
                      <ListItemIcon sx={{ minWidth: 40 }}><ComputerIcon color="info" /></ListItemIcon>
                      <ListItemText 
                        primary="Plataforma / Sistema" 
                        secondary={selectedMetadata.device?.platform || 'Desconocida'} 
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                    <ListItem divider>
                      <ListItemIcon sx={{ minWidth: 40 }}><WebIcon color="info" /></ListItemIcon>
                      <ListItemText 
                        primary="Navegador (User Agent)" 
                        secondary={selectedMetadata.device?.userAgent || 'Desconocido'} 
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{ variant: 'caption', sx: { wordBreak: 'break-word', display: 'block', mt: 0.5 } }}
                      />
                    </ListItem>
                    <ListItem divider>
                      <ListItemIcon sx={{ minWidth: 40 }}><DesktopWindowsIcon color="info" /></ListItemIcon>
                      <ListItemText 
                        primary="Resolución de pantalla" 
                        secondary={selectedMetadata.device?.screenResolution || 'Desconocida'} 
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon sx={{ minWidth: 40 }}><LanguageIcon color="info" /></ListItemIcon>
                      <ListItemText 
                        primary="Idioma y Región" 
                        secondary={`${selectedMetadata.device?.language || 'N/A'} • ${selectedMetadata.device?.timezone || 'N/A'}`} 
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMetadataOpen(false)} variant="outlined">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AttendancePage;
