import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import {
  Box,
  Button,
  Stack,
  Card,
  CardContent,
  Typography,
  TextField,
  Autocomplete,
  Chip,
  InputAdornment,
  Divider,
  CircularProgress,
  Alert,
  alpha,
  useTheme,
  IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  CheckCircle as CheckCircleIcon,
  EditNote as EditNoteIcon,
  AssignmentTurnedIn as AssignmentTurnedInIcon,
  Inventory2 as Inventory2Icon,
  Notes as NotesIcon,
  Add as AddIcon,
  CloudUpload as CloudUploadIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { PageHeader } from '../../../components/common/PageHeader';
import { useWorkOrders, useWorkOrder } from '../hooks';
import { useOrders, useOrder } from '../../orders/hooks';
import { getAliveQuantity } from '../../orders/utils/partialAnnulment';
import { useProductionAreas } from '../../production-areas/hooks/useProductionAreas';
import { useSupplies } from '../../portfolio/supplies/hooks/useSupplies';
import { useUsers } from '../../users/hooks/useUsers';
import { useAuthStore } from '../../../store/authStore';
import { ROUTES, PERMISSIONS } from '../../../utils/constants';
import { storageApi } from '../../../api/storage.api';
import { CreateSupplyModal } from '../components/CreateSupplyModal';
import type { Order } from '../../../types/order.types';
import { WORK_ORDER_CREATABLE_ORDER_STATUSES } from '../../../types/order.types';
import { LoadingButton } from '../../../components/common/LoadingButton';
import type {
  CreateWorkOrderDto,
  CreateWorkOrderItemDto,
  UpdateWorkOrderDto,
  SupplyInputDto,
} from '../../../types/work-order.types';

const formatCurrency = (value: string | number): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(isNaN(num) ? 0 : num);
};

interface WorkOrderItemForm {
  orderItemId: string;
  productDescription: string;
  productionAreaIds: string[];
  supplies: SupplyInputDto[];
  observations: string;
}

// ─── Step config ──────────────────────────────────────────────────────────────

interface StepConfig {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}

const STEPS: StepConfig[] = [
  { label: 'Seleccionar Orden', subtitle: 'Orden de pedido base', icon: <SearchIcon fontSize="small" /> },
  { label: 'Datos de la OT', subtitle: 'Asesor, diseñador y archivo', icon: <EditNoteIcon fontSize="small" /> },
  { label: 'Productos e Insumos', subtitle: 'Áreas y materiales por ítem', icon: <Inventory2Icon fontSize="small" /> },
  { label: 'Observaciones y Confirmar', subtitle: 'Notas finales y guardar', icon: <NotesIcon fontSize="small" /> },
];

// ─── StepHeader component ─────────────────────────────────────────────────────

interface StepHeaderProps {
  index: number;
  config: StepConfig;
  status: 'active' | 'completed' | 'visited' | 'pending';
  clickable?: boolean;
  onClick?: () => void;
}

const StepHeader: React.FC<StepHeaderProps> = ({ index, config, status, clickable, onClick }) => {
  const theme = useTheme();
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isVisited = status === 'visited';

  const successGreen = theme.palette.success.dark; // #10B981

  const numberBg = isActive
    ? theme.palette.primary.main
    : isCompleted
    ? successGreen
    : isVisited
    ? theme.palette.warning.main
    : theme.palette.action.disabled;

  const borderColor = isActive
    ? alpha(theme.palette.primary.main, 0.2)
    : isVisited
    ? alpha(theme.palette.warning.main, 0.2)
    : 'transparent';

  const bgColor = isActive
    ? alpha(theme.palette.primary.main, 0.06)
    : isVisited
    ? alpha(theme.palette.warning.main, 0.06)
    : 'transparent';

  const labelColor = isActive
    ? theme.palette.primary.main
    : isCompleted
    ? successGreen
    : isVisited
    ? theme.palette.warning.main
    : theme.palette.text.primary;

  return (
    <Box
      onClick={clickable ? onClick : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 2,
        cursor: clickable ? 'pointer' : 'default',
        borderRadius: 2,
        bgcolor: bgColor,
        border: `1px solid ${borderColor}`,
        transition: 'all 0.2s ease',
        '&:hover': clickable ? { bgcolor: alpha(theme.palette.action.hover, 0.08) } : {},
      }}
    >
      {/* Número + badge de check */}
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            bgcolor: numberBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {index + 1}
        </Box>
        {isCompleted && (
          <CheckCircleIcon
            sx={{
              position: 'absolute',
              bottom: -4,
              right: -6,
              fontSize: 16,
              color: successGreen,
              bgcolor: 'background.paper',
              borderRadius: '50%',
            }}
          />
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" fontWeight={600} sx={{ color: labelColor }}>
          {config.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {config.subtitle}
        </Typography>
      </Box>
    </Box>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const WorkOrderFormPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const prefillAppliedRef = useRef(false);

  const { user, hasPermission } = useAuthStore();
  const { createWorkOrderMutation } = useWorkOrders();
  const { workOrderQuery, updateWorkOrderMutation } = useWorkOrder(id);

  const [activeStep, setActiveStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([0]));

  // Step 1: Order selection
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Step 2: OT data
  const [designerId, setDesignerId] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileNameError, setFileNameError] = useState('');
  const [attachment, setAttachment] = useState<{ id: string; originalName: string; size: number } | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [attachment2, setAttachment2] = useState<{ id: string; originalName: string; size: number } | null>(null);
  const [attachmentFile2, setAttachmentFile2] = useState<File | null>(null);
  const [isUploading2, setIsUploading2] = useState(false);
  const [isDragging2, setIsDragging2] = useState(false);
  const [uploadError2, setUploadError2] = useState('');

  // Step 3: Items form
  const [itemsForms, setItemsForms] = useState<WorkOrderItemForm[]>([]);
  const [supplyModalOpenIdx, setSupplyModalOpenIdx] = useState<number | null>(null);

  // Step 4: Observations
  const [observations, setObservations] = useState('');

  // OP de origen cuando se llega desde el detalle de una OP (?orderId=...).
  // Se calcula una sola vez y solo aplica en creación.
  const prefillOrderId = useMemo(() => {
    if (isEdit) return null;
    return new URLSearchParams(location.search).get('orderId');
  }, [isEdit, location.search]);

  // El detalle de OP ya trae la orden completa y nos la pasa por router state,
  // así el prefill es instantáneo. Solo si no viene (deep link / refresh)
  // recurrimos al GET /orders/:id.
  const prefillOrderFromState = !isEdit
    ? ((location.state as { prefillOrder?: Order } | null)?.prefillOrder ?? null)
    : null;

  // Data queries
  const { ordersQuery } = useOrders({
    search: orderSearch,
    limit: 30,
    status: undefined,
    excludeWithWorkOrder: !isEdit,
  });

  // Fetch directo de la OP por ID como respaldo (exacto e inmediato frente a
  // esperar la lista de búsqueda). Se deshabilita si ya llegó por state o si no
  // hay orderId. `useOrder('')` queda deshabilitado.
  const { orderQuery: prefillOrderQuery } = useOrder(
    prefillOrderFromState ? '' : prefillOrderId ?? '',
  );

  // Hay un prefill en curso: se llegó con ?orderId= pero la OP aún no queda
  // seleccionada. Sirve para mostrar un cargador en el paso 1 en lugar del
  // buscador vacío (sobre todo en el camino de respaldo con GET /orders/:id).
  const isPrefilling =
    !isEdit &&
    !!prefillOrderId &&
    !selectedOrder &&
    (prefillOrderFromState != null || prefillOrderQuery.isLoading);
  const { usersQuery } = useUsers();
  const { productionAreasQuery } = useProductionAreas();
  const { suppliesQuery } = useSupplies();

  const availableOrders = (ordersQuery.data?.data ?? []).filter((o: Order) =>
    WORK_ORDER_CREATABLE_ORDER_STATUSES.includes(o.status),
  );
  const availableUsers = (usersQuery.data as { id: string; firstName?: string | null; lastName?: string | null; email: string }[]) ?? [];
  const productionAreas = (productionAreasQuery.data as { id: string; name: string }[]) ?? [];
  // La unidad de consumo se muestra junto a la cantidad: sin ella no se sabe si
  // el número son metros o rollos. La API ya la devuelve.
  const supplies =
    (suppliesQuery.data as {
      id: string;
      name: string;
      sku?: string | null;
      consumptionUnit?: { abbreviation: string } | null;
    }[]) ?? [];

  // Load edit data
  useEffect(() => {
    if (isEdit && workOrderQuery.data) {
      const wo = workOrderQuery.data;
      setDesignerId(wo.designer?.id ?? null);
      setFileName(wo.fileName ?? '');
      if (wo.attachment) {
        setAttachment({
          id: wo.attachment.id,
          originalName: wo.attachment.originalName,
          size: wo.attachment.size,
        });
      }
      if (wo.attachment2) {
        setAttachment2({
          id: wo.attachment2.id,
          originalName: wo.attachment2.originalName,
          size: wo.attachment2.size,
        });
      }
      setObservations(wo.observations ?? '');
      setItemsForms(
        wo.items.map((item) => ({
          orderItemId: item.orderItem.id,
          productDescription: item.productDescription,
          productionAreaIds: item.productionAreas.map((pa) => pa.productionArea.id),
          supplies: item.supplies.map((s) => ({
            supplyId: s.supply.id,
            quantity: s.quantity ? parseFloat(s.quantity) : undefined,
            notes: s.notes ?? undefined,
          })),
          observations: item.observations ?? '',
        })),
      );
      // En edición todos los pasos ya estuvieron completados
      setActiveStep(1);
      setVisitedSteps(new Set([0, 1, 2, 3]));
    }
  }, [isEdit, workOrderQuery.data]);

  // ─── Prefill desde detalle de OP (solo en creación) ────────────────────────
  useEffect(() => {
    if (isEdit || prefillAppliedRef.current) return;

    if (!prefillOrderId) {
      prefillAppliedRef.current = true;
      return;
    }

    // Preferimos la OP que llega por router state (instantánea); si no vino,
    // usamos el fetch directo por ID. Ya no dependemos de la lista de búsqueda
    // (lenta y que fallaba si la OP no estaba entre los primeros resultados).
    const order = prefillOrderFromState ?? prefillOrderQuery.data;
    if (!order) return;

    // Dejamos la OP seleccionada pero NO avanzamos: el usuario revisa el paso 1
    // y pasa al paso 2 cuando quiera con «Siguiente».
    setSelectedOrder(order);
    prefillAppliedRef.current = true;
  }, [isEdit, prefillOrderId, prefillOrderFromState, prefillOrderQuery.data]);

  // When order is selected, initialize item forms
  useEffect(() => {
    if (selectedOrder && !isEdit) {
      setItemsForms(
        // Lo anulado por completo en la OP ya no se produce: no entra a la OT.
        selectedOrder.items
          .filter((item) => getAliveQuantity(item) > 0)
          .map((item) => ({
          orderItemId: item.id,
          productDescription: item.description,
          productionAreaIds: item.productionAreas?.map((pa) => pa.productionArea.id) ?? [],
          supplies: [],
          observations: '',
        })),
      );
    }
  }, [selectedOrder, isEdit]);

  // ─── Navigation ──────────────────────────────────────────────────────────────

  const goToStep = (step: number) => {
    setActiveStep(step);
    setVisitedSteps((prev) => new Set([...prev, step]));
  };

  const getStepStatus = (i: number): 'active' | 'completed' | 'visited' | 'pending' => {
    if (i === activeStep) return 'active';
    if (!visitedSteps.has(i)) return 'pending';
    const validByStep = [
      isEdit || !!selectedOrder,   // step 0
      !fileNameError,               // step 1
      true,                         // step 2 — siempre válido
      true,                         // step 3
    ];
    return validByStep[i] ? 'completed' : 'visited';
  };

  const handleFileNameChange = (value: string) => {
    setFileName(value);
    setFileNameError(value.length > 30 ? 'Máximo 30 caracteres' : '');
  };

  const processFile = async (file: File, isSecond: boolean = false) => {
    if (file.size > 10 * 1024 * 1024) {
      isSecond ? setUploadError2('El archivo excede el tamaño máximo permitido (10MB)') : setUploadError('El archivo excede el tamaño máximo permitido (10MB)');
      return;
    }

    isSecond ? setUploadError2('') : setUploadError('');
    isSecond ? setIsUploading2(true) : setIsUploading(true);
    try {
      const uploaded = await storageApi.uploadFile(file, { entityType: 'work_order' });
      if (isSecond) {
        setAttachment2({
          id: uploaded.id,
          originalName: file.name,
          size: file.size,
        });
        setAttachmentFile2(file);
      } else {
        setAttachment({
          id: uploaded.id,
          originalName: file.name,
          size: file.size,
        });
        setAttachmentFile(file);
      }
    } catch (error) {
      isSecond ? setUploadError2('Error al subir el archivo') : setUploadError('Error al subir el archivo');
    } finally {
      isSecond ? setIsUploading2(false) : setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isSecond: boolean = false) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file, isSecond);
    }
    // reset input
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement | HTMLButtonElement | HTMLLabelElement>, isSecond: boolean = false) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSecond) {
      if (!isUploading2) setIsDragging2(true);
    } else {
      if (!isUploading) setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement | HTMLButtonElement | HTMLLabelElement>, isSecond: boolean = false) => {
    e.preventDefault();
    e.stopPropagation();
    isSecond ? setIsDragging2(false) : setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement | HTMLButtonElement | HTMLLabelElement>, isSecond: boolean = false) => {
    e.preventDefault();
    e.stopPropagation();
    isSecond ? setIsDragging2(false) : setIsDragging(false);
    
    if (isSecond ? isUploading2 : isUploading) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file, isSecond);
    }
  };

  const updateItemForm = (index: number, field: keyof WorkOrderItemForm, value: unknown) => {
    setItemsForms((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  /**
   * Cantidad a consumir de un insumo en un ítem.
   *
   * Se guarda como `undefined` cuando el campo queda vacío: el backend solo
   * descuenta inventario de los insumos con cantidad mayor que cero, así que
   * dejarlo en blanco significa "no descontar", no "descontar cero".
   */
  const updateSupplyQuantity = (index: number, supplyId: string, raw: string) => {
    const parsed = raw === '' ? undefined : Number(raw);
    setItemsForms((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        supplies: updated[index].supplies.map((si) =>
          si.supplyId === supplyId
            ? { ...si, quantity: Number.isFinite(parsed as number) ? parsed : undefined }
            : si,
        ),
      };
      return updated;
    });
  };

  const canGoNext = () => {
    if (activeStep === 0) return isEdit || !!selectedOrder;
    if (activeStep === 1) return !fileNameError;
    return true;
  };

  // ─── Build DTOs ───────────────────────────────────────────────────────────────

  const buildCreateDto = (): CreateWorkOrderDto => {
    const items: CreateWorkOrderItemDto[] = itemsForms.map((form) => ({
      orderItemId: form.orderItemId,
      productDescription: form.productDescription,
      productionAreaIds: form.productionAreaIds.length > 0 ? form.productionAreaIds : undefined,
      supplies: form.supplies.length > 0 ? form.supplies : undefined,
      observations: form.observations || undefined,
    }));
    return {
      orderId: selectedOrder!.id,
      designerId: designerId ?? undefined,
      fileName: fileName || undefined,
      attachmentId: attachment?.id || undefined,
      attachment2Id: attachment2?.id || undefined,
      observations: observations || undefined,
      items,
    };
  };

  const buildUpdateDto = (): UpdateWorkOrderDto => {
    const items: CreateWorkOrderItemDto[] = itemsForms.map((form) => ({
      orderItemId: form.orderItemId,
      productDescription: form.productDescription,
      productionAreaIds: form.productionAreaIds.length > 0 ? form.productionAreaIds : undefined,
      supplies: form.supplies.length > 0 ? form.supplies : undefined,
      observations: form.observations || undefined,
    }));
    return {
      designerId: designerId ?? undefined,
      fileName: fileName || undefined,
      attachmentId: attachment?.id === undefined && attachmentFile === null && !attachment
          ? null 
          : attachment?.id || undefined,
      attachment2Id: attachment2?.id === undefined && attachmentFile2 === null && !attachment2
          ? null 
          : attachment2?.id || undefined,
      observations: observations || undefined,
      items,
    };
  };

  // `useSingleFlight` porque el guardado sube adjuntos antes de crear la OT: cada
  // clic genera IDs de archivo nuevos, así que dos clics producen dos cuerpos
  // distintos y la deduplicación de red no los reconoce como la misma acción.
  const handleSaveDraft = useSingleFlight(async () => {
    if (isEdit) {
      await updateWorkOrderMutation.mutateAsync({ id: id!, dto: buildUpdateDto() });
      navigate(ROUTES.WORK_ORDERS_DETAIL.replace(':id', id!));
    } else {
      const newWo = await createWorkOrderMutation.mutateAsync({ dto: buildCreateDto(), confirmed: false });
      navigate(ROUTES.WORK_ORDERS_DETAIL.replace(':id', newWo.id));
    }
  });

  const handleConfirm = useSingleFlight(async () => {
    if (isEdit) {
      await updateWorkOrderMutation.mutateAsync({ id: id!, dto: buildUpdateDto() });
      navigate(ROUTES.WORK_ORDERS_DETAIL.replace(':id', id!));
    } else {
      const newWo = await createWorkOrderMutation.mutateAsync({ dto: buildCreateDto(), confirmed: true });
      navigate(ROUTES.WORK_ORDERS_DETAIL.replace(':id', newWo.id));
    }
  });

  const isSaving = createWorkOrderMutation.isPending || updateWorkOrderMutation.isPending;

  // ─── Summaries ────────────────────────────────────────────────────────────────

  const step0Summary = isEdit
    ? `${workOrderQuery.data?.order.orderNumber} — ${workOrderQuery.data?.order.client.name}`
    : selectedOrder
    ? `${selectedOrder.orderNumber} — ${selectedOrder.client?.name}`
    : '';

  // ─── Loading ──────────────────────────────────────────────────────────────────

  if (isEdit && workOrderQuery.isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );
  }

  // ─── Step renderers ───────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <Stack spacing={3}>
      <Typography variant="h6" fontWeight={600}>
        Seleccionar Orden de Pedido
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Busca y selecciona la orden de pedido base para la OT. Solo órdenes en estado{' '}
        <strong>CONFIRMADA</strong>, <strong>EN PRODUCCIÓN</strong>, <strong>LISTA</strong> o{' '}
        <strong>ENTREGADA</strong>.
      </Typography>

      {isEdit ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Vinculada a la orden <strong>{workOrderQuery.data?.order.orderNumber}</strong> —{' '}
          <strong>{workOrderQuery.data?.order.client.name}</strong>
        </Alert>
      ) : isPrefilling ? (
        <Stack alignItems="center" spacing={2} sx={{ py: 5 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            Cargando la orden de pedido…
          </Typography>
        </Stack>
      ) : (
        <Stack spacing={2.5}>
          <Autocomplete
            options={availableOrders}
            getOptionLabel={(o) => `${o.orderNumber} — ${o.client?.name ?? ''}`}
            value={selectedOrder}
            isOptionEqualToValue={(o, v) => o.id === v?.id}
            onChange={(_, value) => setSelectedOrder(value)}
            inputValue={orderSearch}
            onInputChange={(_, value) => setOrderSearch(value)}
            loading={ordersQuery.isLoading}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Buscar orden por número o cliente"
                placeholder="Escribe para buscar..."
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <>
                      <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      {params.InputProps.startAdornment}
                    </>
                  ),
                }}
              />
            )}
            noOptionsText="No se encontraron órdenes"
          />

          {selectedOrder && (
            <Card variant="outlined" sx={{ borderRadius: 2, borderColor: 'primary.main' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Orden</Typography>
                    <Typography variant="body2" fontWeight={600}>{selectedOrder.orderNumber}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Cliente</Typography>
                    <Typography variant="body2" fontWeight={600}>{selectedOrder.client?.name}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Total</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatCurrency(selectedOrder.total)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Ítems</Typography>
                    <Typography variant="body2" fontWeight={600}>{selectedOrder.items?.length ?? 0} producto(s)</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}
    </Stack>
  );

  const renderStep1 = () => (
    <Stack spacing={3}>
      <Typography variant="h6" fontWeight={600}>
        Datos de la Orden de Trabajo
      </Typography>

      <TextField
        label="Nº OT"
        value={
          isEdit
            ? workOrderQuery.data?.workOrderNumber ?? 'Cargando...'
            : 'Se asignará automáticamente (OT-XXXX-XXXX)'
        }
        disabled
        fullWidth
        size="small"
      />

      <TextField
        label="Asesor"
        value={
          `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || ''
        }
        disabled
        fullWidth
        size="small"
      />

      <Autocomplete
        options={availableUsers}
        getOptionLabel={(u) =>
          `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email
        }
        value={availableUsers.find((u) => u.id === designerId) ?? null}
        onChange={(_, value) => setDesignerId(value?.id ?? null)}
        renderInput={(params) => (
          <TextField {...params} label="Diseñador (opcional)" size="small" />
        )}
        clearOnEscape
      />

      <TextField
        label="Nombre del archivo"
        value={fileName}
        onChange={(e) => handleFileNameChange(e.target.value)}
        error={!!fileNameError}
        helperText={fileNameError || `${fileName.length}/30 caracteres`}
        inputProps={{ maxLength: 30 }}
        fullWidth
        size="small"
      />

      <Box>
        <Typography variant="body2" fontWeight={600} gutterBottom>
          Archivo adjunto de la OT
        </Typography>
        {attachment ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Box>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {attachment.originalName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {(attachment.size / 1024 / 1024).toFixed(2)} MB
              </Typography>
            </Box>
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                setAttachment(null);
                setAttachmentFile(null);
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        ) : (
          <LoadingButton
            loading={isUploading}
            component="label"
            variant="outlined"
            size="small"
            startIcon={<CloudUploadIcon />}
            fullWidth
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
              justifyContent: 'flex-start',
              p: 2,
              borderStyle: 'dashed',
              borderWidth: 2,
              textAlign: 'left',
              borderColor: isDragging ? 'primary.main' : 'divider',
              bgcolor: isDragging ? alpha('#1976d2', 0.04) : 'transparent',
              color: isDragging ? 'primary.main' : 'text.secondary',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha('#1976d2', 0.04),
              },
            }}
          >
            <Typography variant="body2" sx={{ ml: 1 }}>
              {isUploading ? 'Subiendo...' : 'Haz clic o arrastra un archivo aquí (Max 10MB)'}
            </Typography>
            <input
              type="file"
              hidden
              onChange={handleFileUpload}
            />
          </LoadingButton>
        )}
        {uploadError && (
          <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
            {uploadError}
          </Typography>
        )}
      </Box>

      <Box>
        <Typography variant="body2" fontWeight={600} gutterBottom>
          Archivo adjunto de la OT (Adicional)
        </Typography>
        {attachment2 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Box>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {attachment2.originalName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {(attachment2.size / 1024 / 1024).toFixed(2)} MB
              </Typography>
            </Box>
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                setAttachment2(null);
                setAttachmentFile2(null);
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        ) : (
          <LoadingButton
            loading={isUploading2}
            component="label"
            variant="outlined"
            size="small"
            startIcon={<CloudUploadIcon />}
            fullWidth
            onDragOver={(e) => handleDragOver(e, true)}
            onDragLeave={(e) => handleDragLeave(e, true)}
            onDrop={(e) => handleDrop(e, true)}
            sx={{
              justifyContent: 'flex-start',
              p: 2,
              borderStyle: 'dashed',
              borderWidth: 2,
              textAlign: 'left',
              borderColor: isDragging2 ? 'primary.main' : 'divider',
              bgcolor: isDragging2 ? alpha('#1976d2', 0.04) : 'transparent',
              color: isDragging2 ? 'primary.main' : 'text.secondary',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha('#1976d2', 0.04),
              },
            }}
          >
            <Typography variant="body2" sx={{ ml: 1 }}>
              {isUploading2 ? 'Subiendo...' : 'Haz clic o arrastra un archivo aquí (Max 10MB)'}
            </Typography>
            <input
              type="file"
              hidden
              onChange={(e) => handleFileUpload(e, true)}
            />
          </LoadingButton>
        )}
        {uploadError2 && (
          <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
            {uploadError2}
          </Typography>
        )}
      </Box>
    </Stack>
  );

  const renderStep2 = () => (
    <Stack spacing={3}>
      <Typography variant="h6" fontWeight={600}>
        Productos e Insumos
      </Typography>

      {itemsForms.length === 0 && (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          No hay ítems para configurar. Vuelve al paso 1 y selecciona una orden.
        </Alert>
      )}

      {supplyModalOpenIdx !== null && (
        <CreateSupplyModal
          open
          onClose={() => setSupplyModalOpenIdx(null)}
          onSuccess={(newSupply) => {
            updateItemForm(supplyModalOpenIdx, 'supplies', [
              ...itemsForms[supplyModalOpenIdx].supplies,
              { supplyId: newSupply.id },
            ]);
            setSupplyModalOpenIdx(null);
          }}
        />
      )}

      {itemsForms.map((itemForm, i) => {
        const sourceItem = isEdit
          ? workOrderQuery.data?.items[i]?.orderItem
          : // Por id y no por posición: los ítems anulados se filtran arriba y
            // los índices dejan de coincidir con los de la OP.
            selectedOrder?.items.find((it) => it.id === itemForm.orderItemId);
        const annulledQuantity =
          parseFloat(sourceItem?.annulledQuantity ?? '0') || 0;

        return (
          <Card key={itemForm.orderItemId} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Producto {i + 1}
                </Typography>
                {sourceItem?.quantity != null && (
                  <Chip
                    label={
                      annulledQuantity > 0
                        ? `Cant: ${Number(sourceItem.quantity) - annulledQuantity} (${annulledQuantity} anuladas en la OP)`
                        : `Cant: ${sourceItem.quantity}`
                    }
                    size="small"
                    variant="outlined"
                    color={annulledQuantity > 0 ? 'error' : 'default'}
                  />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Original: {sourceItem?.description}
              </Typography>
              <Divider sx={{ my: 1.5 }} />

              <Stack spacing={2}>
                <TextField
                  label="Descripción"
                  value={itemForm.productDescription}
                  onChange={(e) => updateItemForm(i, 'productDescription', e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />

                <Autocomplete
                  multiple
                  options={productionAreas}
                  getOptionLabel={(pa) => pa.name}
                  value={productionAreas.filter((pa) => itemForm.productionAreaIds.includes(pa.id))}
                  onChange={(_, value) =>
                    updateItemForm(i, 'productionAreaIds', value.map((v) => v.id))
                  }
                  renderTags={(value, getTagProps) =>
                    value.map((option, ti) => (
                      <Chip label={option.name} {...getTagProps({ index: ti })} key={option.id} size="small" />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Áreas de producción"
                      placeholder="Selecciona una o más áreas"
                      size="small"
                    />
                  )}
                />

                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Autocomplete
                    multiple
                    options={supplies}
                    getOptionLabel={(s) => s.sku ? `${s.name} (${s.sku})` : s.name}
                    value={supplies.filter((s) => itemForm.supplies.some((si) => si.supplyId === s.id))}
                    onChange={(_, value) =>
                      updateItemForm(
                        i,
                        'supplies',
                        // Se conserva la cantidad ya escrita de los insumos que
                        // siguen seleccionados: remapear a `{ supplyId }` la
                        // borraba en cada cambio de la selección.
                        value.map(
                          (v) =>
                            itemForm.supplies.find((si) => si.supplyId === v.id) ?? {
                              supplyId: v.id,
                            },
                        ),
                      )
                    }
                    renderTags={(value, getTagProps) =>
                      value.map((option, ti) => (
                        <Chip label={option.name} {...getTagProps({ index: ti })} key={option.id} size="small" />
                      ))
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Insumos (opcional)"
                        placeholder="Selecciona insumos necesarios"
                        size="small"
                      />
                    )}
                    sx={{ flex: 1 }}
                  />
                  {hasPermission(PERMISSIONS.CREATE_SUPPLIES) && (
                    <Button
                      onClick={() => setSupplyModalOpenIdx(i)}
                      size="verySmall"
                      color="primary"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
                    >
                      Nuevo insumo
                    </Button>
                  )}
                </Stack>

                {itemForm.supplies.length > 0 && (
                  <Stack
                    spacing={1}
                    sx={{
                      pl: 1.5,
                      borderLeft: 2,
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Cantidad a consumir de cada insumo. El stock se descuenta al
                      completar la OT; si la dejas vacía, no se descuenta nada.
                    </Typography>
                    {itemForm.supplies.map((si) => {
                      const supply = supplies.find((s) => s.id === si.supplyId);
                      return (
                        <Stack
                          key={si.supplyId}
                          direction="row"
                          spacing={1}
                          alignItems="center"
                        >
                          <Typography variant="body2" sx={{ flex: 1 }}>
                            {supply?.name ?? si.supplyId}
                          </Typography>
                          <TextField
                            label="Cantidad"
                            type="number"
                            size="small"
                            value={si.quantity ?? ''}
                            onChange={(e) =>
                              updateSupplyQuantity(i, si.supplyId, e.target.value)
                            }
                            inputProps={{ min: 0, step: 'any' }}
                            InputProps={{
                              endAdornment: supply?.consumptionUnit ? (
                                <InputAdornment position="end">
                                  {supply.consumptionUnit.abbreviation}
                                </InputAdornment>
                              ) : undefined,
                            }}
                            sx={{ width: 160 }}
                          />
                        </Stack>
                      );
                    })}
                  </Stack>
                )}

                <TextField
                  label="Observaciones del ítem"
                  value={itemForm.observations}
                  onChange={(e) => updateItemForm(i, 'observations', e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );

  const renderStep3 = () => {
    return (
      <Stack spacing={3}>
        <Typography variant="h6" fontWeight={600}>
          Observaciones y Confirmar
        </Typography>

        <TextField
          label="Observaciones generales de la OT"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          fullWidth
          multiline
          rows={4}
          size="small"
          placeholder="Instrucciones especiales, notas de producción..."
        />

        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" gutterBottom>
              RESUMEN
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2">
                <strong>Orden:</strong> {step0Summary}
              </Typography>
              <Typography variant="body2">
                <strong>Archivo:</strong> {fileName || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Productos:</strong> {itemsForms.length}
              </Typography>
              {designerId && availableUsers.find((u) => u.id === designerId) && (
                <Typography variant="body2">
                  <strong>Diseñador:</strong>{' '}
                  {`${availableUsers.find((u) => u.id === designerId)?.firstName ?? ''} ${availableUsers.find((u) => u.id === designerId)?.lastName ?? ''}`.trim()}
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <Box>
      <PageHeader
        title={isEdit ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
        subtitle={
          isEdit
            ? `Editando ${workOrderQuery.data?.workOrderNumber}`
            : 'Crear OT desde una orden de pedido'
        }
      />

      {/* ── PASOS TOP ── */}
      <Box
        sx={{
          position: 'relative',
          bgcolor: 'background.default',
          pt: 2,
          pb: 1,
          mb: 3,
          mx: { xs: -1, sm: -2, md: -3 }, // Para abarcar todo el margen
          px: { xs: 1, sm: 2, md: 3 },
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{
            overflowX: 'auto',
            pb: 1,
            '&::-webkit-scrollbar': { height: 6 },
            '&::-webkit-scrollbar-thumb': { borderRadius: 3, bgcolor: 'rgba(255,255,255,0.2)' },
          }}
        >
          {STEPS.map((step, i) => (
            <Box key={i} sx={{ minWidth: { xs: 240, md: 0 }, flex: { md: 1 } }}>
              <StepHeader
                index={i}
                config={step}
                status={getStepStatus(i)}
                clickable={visitedSteps.has(i) && i !== activeStep}
                onClick={() => goToStep(i)}
              />
            </Box>
          ))}
        </Stack>
      </Box>

      <Box sx={{ maxWidth: '100%' }}>
        {/* ── Contenido del paso activo ── */}
        <Box flex={1}>
          {activeStep === 0 && renderStep0()}
          {activeStep === 1 && renderStep1()}
          {activeStep === 2 && renderStep2()}
          {activeStep === 3 && renderStep3()}

          {/* Navegación */}
          <Stack
            direction={{ xs: 'column-reverse', sm: 'row' }}
            justifyContent="space-between"
            spacing={{ xs: 1, sm: 0 }}
            sx={{ mt: 4 }}
          >
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() =>
                activeStep === 0 ? navigate(ROUTES.WORK_ORDERS) : goToStep(activeStep - 1)
              }
              disabled={isSaving}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              {activeStep === 0 ? 'Cancelar' : 'Anterior'}
            </Button>

            {activeStep < STEPS.length - 1 ? (
              <Button
                variant="contained"
                endIcon={<AssignmentTurnedInIcon />}
                onClick={() => goToStep(activeStep + 1)}
                disabled={!canGoNext() || isSaving}
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                Siguiente
              </Button>
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                  variant="outlined"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  {isSaving ? <CircularProgress size={16} /> : 'Guardar Borrador'}
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  onClick={handleConfirm}
                  disabled={isSaving}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  {isSaving ? (
                    <CircularProgress size={16} />
                  ) : isEdit ? (
                    'Guardar'
                  ) : (
                    'Crear OT'
                  )}
                </Button>
              </Stack>
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

export default WorkOrderFormPage;
