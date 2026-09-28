import React, { useState, useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  FormControlLabel,
  Checkbox,
  TextField,
  Button,
  Stack,
  Grid,
  Typography,
  Divider,
  MenuItem,
  CircularProgress,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { commercialChannelsApi } from '../../../api/commercialChannels.api';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, Controller, type SubmitHandler, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DateTimePicker } from '@mui/x-date-pickers';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  CheckCircle as CheckCircleIcon,
  Person as PersonIcon,
  ShoppingCart as ShoppingCartIcon,
  AttachMoney as AttachMoneyIcon,
  Notes as NotesIcon,
  Image as ImageIcon,
  AddPhotoAlternate as AddPhotoAlternateIcon,
  Visibility as VisibilityIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import { PageHeader } from '../../../components/common/PageHeader';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useOrders, useOrder } from '../hooks';
import { ordersApi } from '../../../api/orders.api';
import { prospectsApi } from '../../../api/prospects.api';
import { useEditRequests } from '../../../hooks/useEditRequests';
import {
  ClientSelector,
  OrderItemsTable,
  OrderTotals,
  InitialPayment,
  ActivePermissionBanner,
} from '../components';
import type { Client } from '../../../types/client.types';
import { useAuthStore } from '../../../store/authStore';
import { enqueueSnackbar } from 'notistack';
import { storageApi } from '../../../api/storage.api';
import { useQueryClient } from '@tanstack/react-query';
import { applyColombianRounding, roundToWholePeso } from '../../../utils/formatters';
import { paymentMethodLabel, requiresZeroAmount } from '../../../utils/paymentMethods';

// ============================================================
// VALIDATION SCHEMA
// ============================================================

const orderItemSchema = z.object({
  id: z.string(),
  description: z.string().min(1, 'La descripción es requerida'),
  quantity: z.string().min(1, 'La cantidad es requerida'),
  unitPrice: z.string().min(1, 'El precio unitario es requerido'),
  total: z.number().min(0),
  productId: z.string().optional(),
  specifications: z.record(z.any()).optional(),
  sampleImageId: z.string().nullable().optional(),
  productionAreaIds: z.array(z.string()),
});

const initialPaymentSchema = z
  .object({
    amount: z.number().min(0, 'El monto del abono inicial no puede ser negativo'),
    paymentMethod: z.enum([
      'CASH',
      'TRANSFER',
      'CARD',
      'CREDIT',
      'CREDIT_BALANCE',
      'PAYROLL_DEDUCTION',
    ]),
    reference: z.string().optional(),
    notes: z.string().optional(),
    bankEntity: z.string().nullable().optional(),
    receiptFile: z.any().optional(),
    receiptFileUrl: z.any().optional(),
    existingReceiptFileId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      // El crédito no registra dinero: es la marca de "se entrega y el cliente
      // paga después". Si se le pone monto, la OP nace pagada sin que haya
      // entrado un peso y el abono real posterior queda duplicado.
      //
      // El descuento por nómina va igual y por el mismo motivo: cuando se crea
      // la OP el descuento todavía no ha ocurrido. El abono con el valor real lo
      // genera nómina al aplicarlo sobre la quincena del empleado.
      if (requiresZeroAmount(data.paymentMethod)) return data.amount === 0;
      return data.amount > 0;
    },
    (data) => ({
      message: requiresZeroAmount(data.paymentMethod)
        ? data.paymentMethod === 'PAYROLL_DEDUCTION'
          ? 'El descuento por nómina no registra dinero al crear la orden: el monto debe ser 0'
          : 'Un pago a crédito no registra dinero: el monto debe ser 0'
        : 'El monto del abono inicial debe ser mayor a cero',
      path: ['amount'],
    })
  );

const orderFormSchema = z
  .object({
    client: z.custom<Client | null>((val) => val !== null, {
      message: 'Debe seleccionar un cliente',
    }).nullable(),
    deliveryDate: z.date().nullable(),
    deliveryDateReason: z.string().optional(),
    notes: z.string().optional(),
    notesImageId: z.string().nullable().optional(),
    requiresColorProof: z.boolean().default(false),
    colorProofPrice: z.number().min(0).optional(),
    items: z.array(orderItemSchema).min(1, 'Debe agregar al menos un item'),
    applyTax: z.boolean(),
    taxRate: z.number().min(0).max(100),
    applyWithholdings: z.boolean(),
    retefuente: z.string().optional(),
    retefuenteCustom: z.string().optional(),
    reteICA: z.string().optional(),
    reteIVA: z.string().optional(),
    useCreditBalance: z.boolean().optional(),
    payments: z.array(initialPaymentSchema).min(1),
    commercialChannelId: z.string().min(1, 'El canal de ventas es requerido'),
  })
  .refine(
    (data) => {
      return data.items.every((item) => {
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unitPrice);
        return !isNaN(qty) && qty > 0 && !isNaN(price) && price > 0;
      });
    },
    {
      message: 'Todos los items deben tener cantidad y precio válidos',
      path: ['items'],
    }
  )
  // Se eliminó la validación que restringe que los pagos superen el total, dado que se permite saldo a favor
  .refine(
    (data) => {
      const cashCount = data.payments.filter((p) => p.paymentMethod === 'CASH').length;
      return cashCount <= 1;
    },
    {
      message: 'Solo puede registrarse un anticipo en Efectivo',
      path: ['payments'],
    }
  )
  .refine(
    () => true,
    {
      message: 'Debe indicar la razón del cambio de fecha',
      path: ['deliveryDateReason'],
    }
  )
  .refine(
    (data) => {
      if (!data.applyWithholdings) return true;
      const hasRetefuente =
        data.retefuente === 'other'
          ? !!(data.retefuenteCustom?.trim())
          : !!(data.retefuente);
      return hasRetefuente || !!(data.reteICA) || !!(data.reteIVA);
    },
    { message: 'Debe configurar al menos una retención', path: ['applyWithholdings'] }
  )
  .refine(
    (data) => {
      if (!data.applyWithholdings || data.retefuente !== 'other') return true;
      return !!(data.retefuenteCustom?.trim());
    },
    { message: 'Ingrese el porcentaje de Retefuente personalizado', path: ['retefuenteCustom'] }
  );

type OrderFormData = z.infer<typeof orderFormSchema>;

// Porcentajes de Retefuente predefinidos (valores del select, como string literal)
const RETEFUENTE_OPTIONS = ['2.5', '3.5', '4.0'] as const;

const formatCurrencyInput = (value: string): string => {
  const numericValue = value.replace(/\D/g, '');
  if (!numericValue) return '';
  const number = parseInt(numericValue, 10);
  return new Intl.NumberFormat('es-CO').format(number);
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value);

// ============================================================
// STEP CONFIG
// ============================================================

interface StepConfig {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}

const STEPS: StepConfig[] = [
  { label: 'Cliente y Fechas', subtitle: 'Datos del cliente y canal de ventas', icon: <PersonIcon fontSize="small" /> },
  { label: 'Ítems de la Orden', subtitle: 'Productos y cantidades', icon: <ShoppingCartIcon fontSize="small" /> },
  { label: 'Totales y Pago', subtitle: 'Impuestos, abono y prueba de color', icon: <AttachMoneyIcon fontSize="small" /> },
  { label: 'Observaciones y Confirmar', subtitle: 'Notas finales y guardar', icon: <NotesIcon fontSize="small" /> },
];

// ============================================================
// STEP HEADER COMPONENT
// ============================================================

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

  const successGreen = theme.palette.success.dark;

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

// ============================================================
// MAIN COMPONENT
// ============================================================

export const OrderFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  // `clientId` y `prospectId` los pone el Pipeline de Ventas al convertir.
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const isEdit = !!id;
  const { orderQuery, updateOrderMutation } = useOrder(id || '');
  const { createOrderMutation } = useOrders();
  // Las órdenes provenientes de DTF se identifican por la nota "[DTF] ...".
  // En ellas el abono se edita desde este formulario (no por el flujo dedicado).
  const isDtfOrder = orderQuery.data?.notes?.startsWith('[DTF]') ?? false;
  // Si Caja rechazó el anticipo, el pago fue eliminado y la orden quedó sin abono.
  // Se habilita de nuevo "Abono Inicial" aquí para que el asesor pueda corregirlo:
  // es la única vía, ya que "Historial de Pagos" queda vacío y el cambio de estado
  // está bloqueado mientras el anticipo esté rechazado.
  const isAdvanceRejected = orderQuery.data?.advancePaymentStatus === 'REJECTED';
  // En órdenes no-DTF el abono solo se edita aquí cuando hay que rehacer el rechazado.
  const canEditPaymentHere = isDtfOrder || isAdvanceRejected;
  const { activePermissionQuery } = useEditRequests(id || '');
  const isAdmin = user?.role?.name === 'admin';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const queryClient = useQueryClient();
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([0]));

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['commercial-channels'],
    queryFn: () => commercialChannelsApi.getAll(),
  });

  const currentUserFullName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
    : '';

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors, isValid },
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderFormSchema) as Resolver<OrderFormData>,
    mode: 'onChange',
    defaultValues: {
      client: null,
      deliveryDate: null,
      deliveryDateReason: '',
      notes: '',
      notesImageId: null,
      requiresColorProof: false,
      colorProofPrice: undefined,
      items: [
        {
          id: uuidv4(),
          description: '',
          quantity: '',
          unitPrice: '',
          total: 0,
          productionAreaIds: [],
        },
      ],
      applyTax: false,
      taxRate: 19,
      applyWithholdings: false,
      retefuente: '',
      retefuenteCustom: '',
      reteICA: '',
      reteIVA: '',
      useCreditBalance: false,
      payments: [
        {
          amount: 0,
          paymentMethod: 'CASH',
          reference: '',
          notes: '',
          bankEntity: null,
        },
      ],
      commercialChannelId: '',
    },
  });

  const selectedClient = watch('client');
  const items = watch('items');
  const applyTax = watch('applyTax');
  const taxRate = watch('taxRate');
  const applyWithholdings = watch('applyWithholdings');
  const retefuente = watch('retefuente');
  const retefuenteCustomValue = watch('retefuenteCustom');
  const reteICAValue = watch('reteICA');
  const reteIVAValue = watch('reteIVA');
  const deliveryDate = watch('deliveryDate');
  const requiresColorProof = watch('requiresColorProof');
  const colorProofPrice = requiresColorProof ? watch('colorProofPrice') || 0 : 0;
  const commercialChannelId = watch('commercialChannelId');

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);

  // Retefuente y ReteICA se calculan sobre el subtotal (antes de IVA)
  const retefuenteActualRate = applyWithholdings
    ? retefuente === 'other'
      ? parseFloat(retefuenteCustomValue || '0') || 0
      : parseFloat(retefuente || '0') || 0
    : 0;
  const retefuenteAmount = subtotal * (retefuenteActualRate / 100);

  const reteICAActualRate = applyWithholdings ? parseFloat(reteICAValue || '0') || 0 : 0;
  const reteICAAmount = subtotal * (reteICAActualRate / 100);

  // IVA se calcula sobre el subtotal original
  const tax = applyTax ? subtotal * (taxRate / 100) : 0;

  // ReteIVA se calcula sobre el monto del IVA
  const reteIVAActualRate = applyWithholdings ? parseFloat(reteIVAValue || '0') || 0 : 0;
  const reteIVAAmount = applyTax ? tax * (reteIVAActualRate / 100) : 0;

  const rawTotal = subtotal - retefuenteAmount - reteICAAmount + tax - reteIVAAmount + colorProofPrice;
  // Con retenciones no aplica el redondeo comercial (distorsiona la base del
  // certificado), pero sí el redondeo a peso entero: los centavos quedarían
  // como saldo a favor que nadie puede saldar.
  const hasRetencionesForTotal = retefuenteAmount > 0 || reteICAAmount > 0 || reteIVAAmount > 0;
  const total = hasRetencionesForTotal
    ? roundToWholePeso(rawTotal)
    : applyColombianRounding(rawTotal);

  const saldoAFavor = selectedClient?.saldoAFavor || 0;
  const useCreditBalance = watch('useCreditBalance');
  const creditBalanceUsed = useCreditBalance ? Math.min(saldoAFavor, total) : 0;
  const remainingTotalAfterCredit = Math.max(0, total - creditBalanceUsed);

  const isClientSelected = !!selectedClient;

  const [isDatePostponed, setIsDatePostponed] = useState(false);
  const [originalDeliveryDate, setOriginalDeliveryDate] = useState<Date | null>(null);

  // Llave de idempotencia de esta creación. Se genera una sola vez al montar el
  // formulario, así que un doble clic (o un reintento de red) manda la misma en
  // las dos peticiones y el backend devuelve la OP ya creada en vez de quemar
  // otro consecutivo. Solo aplica a la creación: en edición no hay nada que
  // duplicar.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  // Imagen adjunta a observaciones
  const notesImageInputRef = useRef<HTMLInputElement>(null);
  const [notesImagePreview, setNotesImagePreview] = useState<string | null>(null);
  const [notesImageUploading, setNotesImageUploading] = useState(false);
  const notesImageId = watch('notesImageId');

  // Cargar URL firmada para previsualizar la imagen de observaciones
  useEffect(() => {
    let active = true;
    if (notesImageId) {
      storageApi
        .getFileUrl(notesImageId)
        .then(({ url }) => {
          if (active) setNotesImagePreview(url);
        })
        .catch(() => {
          /* ignore */
        });
    } else {
      setNotesImagePreview(null);
    }
    return () => {
      active = false;
    };
  }, [notesImageId]);

  useEffect(() => {
    if (isEdit && orderQuery.data && deliveryDate) {
      const currentDate = orderQuery.data.deliveryDate ? new Date(orderQuery.data.deliveryDate) : null;
      const newDate = deliveryDate;
      if (currentDate && !originalDeliveryDate) setOriginalDeliveryDate(currentDate);
      if (originalDeliveryDate && newDate > originalDeliveryDate) {
        setIsDatePostponed(true);
      } else {
        setIsDatePostponed(false);
        setValue('deliveryDateReason', '');
      }
    }
  }, [deliveryDate, isEdit, orderQuery.data, originalDeliveryDate, setValue]);

  useEffect(() => {
    if (!isEdit && selectedClient) {
      setValue('applyTax', selectedClient.personType === 'EMPRESA');
    }
  }, [selectedClient, setValue, isEdit]);

  useEffect(() => {
    if (!applyTax) {
      setValue('applyWithholdings', false);
      setValue('retefuente', '');
      setValue('retefuenteCustom', '');
      setValue('reteICA', '');
      setValue('reteIVA', '');
    }
  }, [applyTax, setValue]);

  // El error "Debe configurar al menos una retención" vive en `applyWithholdings`,
  // pero depende de retefuente/reteICA/reteIVA. React Hook Form solo refresca el
  // error del campo que cambió, así que al elegir la retención el error quedaba
  // pegado y `canSave` (que mira `errors`) dejaba el botón Guardar deshabilitado
  // para siempre. Se revalida explícitamente la ruta afectada.
  useEffect(() => {
    void trigger(['applyWithholdings', 'retefuenteCustom']);
  }, [
    applyWithholdings,
    retefuente,
    retefuenteCustomValue,
    reteICAValue,
    reteIVAValue,
    trigger,
  ]);

  useEffect(() => {
    if (isEdit && orderQuery.data) {
      const order = orderQuery.data;
      // El admin también necesita una ventana abierta: la abre con un motivo
      // desde el detalle de la orden (docs/PLAN_SEDES.md §6.3).
      const canEdit =
        order.status === 'DRAFT' ||
        activePermissionQuery.data !== null;

      if (!canEdit) {
        enqueueSnackbar('No tienes permiso para editar esta orden', { variant: 'error' });
        navigate(`/orders/${id}`);
        return;
      }

      setValue('client', order.client as any);
      setValue('deliveryDate', order.deliveryDate ? new Date(order.deliveryDate) : null);
      setValue('notes', order.notes || '');
      setValue('notesImageId', order.notesImageId || null);
      setValue('requiresColorProof', order.requiresColorProof || false);
      setValue('colorProofPrice', order.colorProofPrice ? parseFloat(order.colorProofPrice) : 0);
      setValue(
        'items',
        order.items.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice,
          total: parseFloat(item.total),
          productId: item.product?.id,
          specifications: item.specifications || undefined,
          sampleImageId: item.sampleImageId,
          productionAreaIds: item.productionAreas
            ? item.productionAreas.map((pa) => pa.productionArea.id)
            : [],
          workOrderNumbers: item.workOrders?.map((wo) => wo.workOrderNumber) ?? [],
        }))
      );
      const currentTaxRate = parseFloat(order.taxRate);
      setValue('applyTax', currentTaxRate > 0);
      setValue('taxRate', currentTaxRate > 0 ? currentTaxRate * 100 : 19);

      const currentRetefuenteRate = parseFloat(order.retefuenteRate || '0');
      const currentReteICARate = parseFloat(order.reteICARate || '0');
      const currentReteIVARate = parseFloat(order.reteIVARate || '0');
      const hasRetenciones = currentRetefuenteRate > 0 || currentReteICARate > 0 || currentReteIVARate > 0;
      setValue('applyWithholdings', hasRetenciones);
      if (currentRetefuenteRate > 0) {
        const pct = currentRetefuenteRate * 100;
        // Los valores del select son strings literales ('2.5' | '3.5' | '4.0'):
        // (4.0).toString() da '4' y no coincide, así que se compara numéricamente.
        const knownRate = RETEFUENTE_OPTIONS.find((opt) => parseFloat(opt) === pct);
        if (knownRate) {
          setValue('retefuente', knownRate);
        } else {
          setValue('retefuente', 'other');
          setValue('retefuenteCustom', pct.toString());
        }
      }
      if (currentReteICARate > 0) setValue('reteICA', (currentReteICARate * 100).toString());
      if (currentReteIVARate > 0) setValue('reteIVA', (currentReteIVARate * 100).toString());

      const firstPayment = order.payments && order.payments.length > 0 ? order.payments[0] : null;
      setValue('payments', [{
        amount: firstPayment ? parseFloat(firstPayment.amount) : 0,
        paymentMethod: firstPayment?.paymentMethod || 'CASH',
        reference: firstPayment?.reference || '',
        notes: firstPayment?.notes || '',
        bankEntity: firstPayment?.bankEntity || null,
        existingReceiptFileId: firstPayment?.receiptFileId || null,
      }]);
      setValue('commercialChannelId', order.commercialChannelId || '');
      // En edición todos los pasos fueron completados
      setVisitedSteps(new Set([0, 1, 2, 3]));
    }
  }, [isEdit, orderQuery.data, id, navigate, setValue, isAdmin, activePermissionQuery.data]);

  // ── Step navigation ──────────────────────────────────────────────────────────

  const goToStep = (step: number) => {
    setActiveStep(step);
    setVisitedSteps((prev) => new Set([...prev, step]));
  };

  const hasValidItems = items.length > 0 && items.some((item) => item.description && item.quantity && item.unitPrice);

  const getStepStatus = (i: number): 'active' | 'completed' | 'visited' | 'pending' => {
    if (i === activeStep) return 'active';
    if (!visitedSteps.has(i)) return 'pending';
    // Validación básica por paso
    const validByStep = [
      isClientSelected && !!commercialChannelId,  // paso 0: cliente + canal de ventas
      hasValidItems,                  // paso 1: al menos un item completo
      hasValidItems,                  // paso 2: requiere items para tener sentido
      true,                           // paso 3
    ];
    return validByStep[i] ? 'completed' : 'visited';
  };

  const canGoNext = () => {
    if (activeStep === 0) return isClientSelected && !!commercialChannelId;
    if (activeStep === 1) return hasValidItems;
    if (activeStep === 2) return hasValidItems;
    return true;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────

  // En edición, si la única validación que falla es la del abono (`payments`),
  // se permite guardar igualmente: el abono no se edita aquí (órdenes no-DTF) o
  // puede ser $0 (órdenes DTF). El resto de errores sí bloquean.
  const onInvalid = (validationErrors: Record<string, unknown>) => {
    const onlyPaymentsError = Object.keys(validationErrors).every(
      (key) => key === 'payments',
    );
    if (isEdit && onlyPaymentsError) {
      void onSubmit(getValues());
    }
  };

  const onSubmit: SubmitHandler<OrderFormData> = async (data) => {
    setIsSubmitting(true);
    try {
      const orderSubtotal = data.items.reduce((sum, i) => sum + i.total, 0);
      const orderTax = data.applyTax ? orderSubtotal * (data.taxRate / 100) : 0;
      const cpPrice = data.requiresColorProof ? (data.colorProofPrice || 0) : 0;
      const orderTotal = orderSubtotal + orderTax + cpPrice;
      const creditBalUsed = data.useCreditBalance ? Math.min(data.client!.saldoAFavor || 0, orderTotal) : 0;

      let initialPaymentsPayload = !isEdit ? data.payments.map((p) => ({
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        reference: p.reference,
        notes: p.notes,
        bankEntity: p.paymentMethod === 'TRANSFER' ? p.bankEntity ?? null : null,
      })) as any[] : undefined;

      if (!isEdit && creditBalUsed > 0) {
        initialPaymentsPayload = [
          {
            amount: creditBalUsed,
            paymentMethod: 'CREDIT_BALANCE',
            reference: 'Uso automático de saldo a favor',
            notes: '',
          },
          ...(initialPaymentsPayload || []),
        ];
      }

      const orderDto = {
        clientId: data.client!.id,
        deliveryDate: data.deliveryDate?.toISOString(),
        ...(isEdit && isDatePostponed && data.deliveryDateReason && {
          deliveryDateReason: data.deliveryDateReason,
        }),
        notes: data.notes,
        notesImageId: data.notesImageId ?? null,
        requiresColorProof: data.requiresColorProof,
        colorProofPrice: data.requiresColorProof ? data.colorProofPrice : 0,
        taxRate: data.applyTax ? data.taxRate / 100 : 0,
        retefuenteRate: data.applyWithholdings && retefuenteActualRate > 0 ? retefuenteActualRate / 100 : 0,
        reteICARate: data.applyWithholdings && reteICAActualRate > 0 ? reteICAActualRate / 100 : 0,
        reteIVARate: data.applyWithholdings && reteIVAActualRate > 0 ? reteIVAActualRate / 100 : 0,
        items: data.items.map((item) => ({
          ...(isEdit && item.id && { id: item.id }),
          description: item.description,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          productId: item.productId,
          specifications: item.specifications,
          sampleImageId: item.sampleImageId ?? undefined,
          productionAreaIds: item.productionAreaIds,
        })),
        // En EDICIÓN, por defecto NO se tocan los pagos desde el formulario:
        // los abonos se editan por el flujo dedicado "Historial de Pagos" (con
        // autorización del admin), evitando sobrescribir el primer pago/inflar saldo.
        // EXCEPCIÓN: órdenes provenientes de DTF, donde el abono se edita aquí
        // (comportamiento previo). En creación se usan initialPayments.
        initialPayment: isEdit && canEditPaymentHere && data.payments[0]?.amount > 0 ? {
          amount: data.payments[0].amount,
          paymentMethod: data.payments[0].paymentMethod,
          reference: data.payments[0].reference,
          notes: data.payments[0].notes,
          bankEntity: data.payments[0].paymentMethod === 'TRANSFER' ? data.payments[0].bankEntity ?? null : null,
        } : undefined,
        initialPayments: initialPaymentsPayload,
        commercialChannelId: data.commercialChannelId,
      };

      if (isEdit) {
        const updatedOrder = await updateOrderMutation.mutateAsync(orderDto);

        // El abono/comprobante solo se edita desde este formulario en órdenes DTF o
        // cuando se está rehaciendo un anticipo rechazado por Caja.
        // Para el resto, los pagos se gestionan en "Historial de Pagos".
        if (canEditPaymentHere) {
          const newPaymentId = updatedOrder?.payments?.[0]?.id;
          if (data.payments[0] && data.payments[0].receiptFile && newPaymentId) {
            try {
              await ordersApi.uploadPaymentReceipt(id!, newPaymentId, data.payments[0].receiptFile);
            } catch (e: any) {
              console.error('Error al subir comprobante en edición:', e);
              enqueueSnackbar('Orden actualizada, pero hubo un error subiendo el comprobante', { variant: 'warning' });
            }
          }
        }

        navigate(`/orders/${id}`);
      } else {
        const newOrder = await createOrderMutation.mutateAsync({
          ...orderDto,
          idempotencyKey: idempotencyKeyRef.current,
        });

        // Subir comprobantes de cada anticipo asociando por método+monto
        if (newOrder.payments && newOrder.payments.length > 0) {
          for (const dp of data.payments) {
            if (!dp.receiptFile) continue;
            const match = newOrder.payments.find(
              (p) => p.paymentMethod === dp.paymentMethod && Math.abs(parseFloat(p.amount as any) - dp.amount) < 1,
            );
            if (match) {
              try {
                await ordersApi.uploadPaymentReceipt(newOrder.id, match.id, dp.receiptFile);
              } catch (e: any) {
                console.error('Error al subir comprobante:', e);
                enqueueSnackbar('Orden creada, pero hubo un error subiendo un comprobante', { variant: 'warning' });
              }
            }
          }
        }

        // Cuando se llega desde el Pipeline de Ventas, se enlaza la orden de
        // vuelta al prospecto para marcarlo como convertido y poder medirlo.
        // Si esto falla, la orden ya quedó creada: no se bloquea al usuario.
        const prospectId = searchParams.get('prospectId');
        if (prospectId) {
          try {
            await prospectsApi.update(prospectId, { orderId: newOrder.id });
          } catch {
            enqueueSnackbar(
              'La orden se creó, pero no se pudo enlazar al prospecto.',
              { variant: 'warning' },
            );
          }
        }

        enqueueSnackbar('Orden creada exitosamente', { variant: 'success' });
        navigate(`/orders/${newOrder.id}`);
      }
    } catch (error: any) {
      if (error?.response?.status === 403) {
        enqueueSnackbar('Tu permiso de edición ha expirado. Solicita un nuevo permiso.', { variant: 'error' });
        navigate(`/orders/${id}`);
      } else {
        setIsSubmitting(false);
      }
    }
  };

  // ── Save gate ────────────────────────────────────────────────────────────────
  // En EDICIÓN los errores de `payments` no deben bloquear "Guardar Cambios":
  //  - órdenes no-DTF: el paso de pago está deshabilitado y el abono no se envía.
  //  - órdenes DTF: el abono puede ser $0 legítimamente (aún sin registrar) y el
  //    usuario podría estar editando otra cosa (item, fecha, etc.).
  // La validación de pago en creación sí se mantiene (canSave = isValid).
  const hasNonPaymentErrors = Object.keys(errors).some((key) => key !== 'payments');
  const canSave = isEdit ? !hasNonPaymentErrors : isValid;

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (isEdit && orderQuery.isLoading) return <LoadingSpinner />;

  // ── Step renderers ────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <Stack spacing={3}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Cliente y Fechas
          </Typography>
          <Divider sx={{ mb: 3 }} />

          <Stack spacing={3}>
            <Controller
              name="client"
              control={control}
              render={({ field }) => (
                <ClientSelector
                  value={field.value}
                  onChange={field.onChange}
                  error={!!errors.client}
                  helperText={errors.client?.message}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  ownershipAuthStatus={isEdit ? orderQuery.data?.clientOwnershipAuthStatus : undefined}
                />
              )}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Fecha de Orden"
                value={new Date().toLocaleDateString('es-CO')}
                disabled={!isClientSelected}
                InputProps={{ readOnly: true }}
                helperText="Fecha de registro"
              />

              <Controller
                name="deliveryDate"
                control={control}
                render={({ field }) => (
                  <DateTimePicker
                    label="Fecha y Hora de Entrega (Opcional)"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!isClientSelected}
                    minDateTime={new Date()}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        helperText: isClientSelected ? 'Fecha y hora estimada' : 'Seleccione cliente',
                      },
                    }}
                  />
                )}
              />

              <TextField
                fullWidth
                label="Creado por"
                value={currentUserFullName}
                InputProps={{ readOnly: true }}
                helperText="Usuario responsable"
              />
            </Stack>

            {isEdit && isDatePostponed && (
              <Controller
                name="deliveryDateReason"
                control={control}
                rules={{ required: isDatePostponed ? 'Debe indicar la razón del cambio de fecha' : false }}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    fullWidth
                    multiline
                    rows={2}
                    label="Razón del cambio de fecha de entrega *"
                    placeholder="Explique por qué se está posponiendo la fecha de entrega..."
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message || 'Este campo es obligatorio cuando se pospone la fecha de entrega'}
                    sx={{ '& .MuiOutlinedInput-root': { backgroundColor: 'warning.lighter' } }}
                  />
                )}
              />
            )}

            <Controller
              name="commercialChannelId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  fullWidth
                  label="Canal de Ventas *"
                  error={!!errors.commercialChannelId}
                  helperText={errors.commercialChannelId?.message || 'Canal por el cual se realizó la venta'}
                  disabled={!isClientSelected || channelsLoading}
                  InputProps={{
                    startAdornment: channelsLoading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null,
                  }}
                >
                  {channels.length > 0 ? (
                    channels.map((channel) => (
                      <MenuItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem disabled value="">
                      No hay canales disponibles
                    </MenuItem>
                  )}
                </TextField>
              )}
            />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );

  // ── Image handlers ──────────────────────────────────────────────────────────

  // El ítem sólo tiene endpoint propio de imagen si ya existe en la BD. Los ítems
  // recién agregados (orden nueva, o ítem agregado a una existente todavía sin
  // guardar) suben al storage genérico y viajan como sampleImageId dentro del DTO.
  const isPersistedItem = (itemId: string) =>
    isEdit && !!orderQuery.data?.items?.some((item: any) => item.id === itemId);

  const uploadImageToForm = async (itemId: string, file: File) => {
    const currentItems = getValues('items');
    const existingItem = currentItems.find(i => i.id === itemId);
    if (existingItem?.sampleImageId) {
      try { await storageApi.deleteFile(existingItem.sampleImageId); } catch { /* ignore */ }
    }
    try {
      const uploadedFile = await storageApi.uploadFile(file, { entityType: 'order' });
      setValue('items', currentItems.map((item) =>
        item.id === itemId ? { ...item, sampleImageId: uploadedFile.id } : item
      ));
      enqueueSnackbar('Imagen subida exitosamente', { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.message || 'Error al subir la imagen', { variant: 'error' });
    }
  };

  const handleImageUpload = async (itemId: string, file: File) => {
    if (!isPersistedItem(itemId)) {
      await uploadImageToForm(itemId, file);
      return;
    }

    try {
      const uploadedFile = await ordersApi.uploadItemSampleImage(id!, itemId, file);
      const currentItems = getValues('items');
      setValue('items', currentItems.map((item) =>
        item.id === itemId ? { ...item, sampleImageId: uploadedFile.id } : item
      ));
      enqueueSnackbar('Imagen subida exitosamente', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.message || 'Error al subir la imagen', { variant: 'error' });
    }
  };

  const handleImageDelete = async (itemId: string) => {
    if (!isPersistedItem(itemId)) {
      const currentItems = getValues('items');
      const item = currentItems.find(i => i.id === itemId);
      if (item?.sampleImageId) {
        try { await storageApi.deleteFile(item.sampleImageId); } catch { /* ignore */ }
      }
      setValue('items', currentItems.map((i) => i.id === itemId ? { ...i, sampleImageId: undefined } : i));
      enqueueSnackbar('Imagen eliminada', { variant: 'success' });
      return;
    }
    try {
      await ordersApi.deleteItemSampleImage(id!, itemId);
      const currentItems = getValues('items');
      setValue('items', currentItems.map((item) =>
        item.id === itemId ? { ...item, sampleImageId: undefined } : item
      ));
      enqueueSnackbar('Imagen eliminada exitosamente', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    } catch {
      enqueueSnackbar('Error al eliminar la imagen', { variant: 'error' });
    }
  };

  // ── Notes image handlers ─────────────────────────────────────────────────────

  const handleNotesImageUpload = async (file: File) => {
    setNotesImageUploading(true);
    try {
      // En creación, si ya había una imagen sin guardar, borrarla para no dejar huérfanos.
      // En edición, el backend elimina la anterior al guardar.
      const existing = getValues('notesImageId');
      if (!isEdit && existing) {
        try { await storageApi.deleteFile(existing); } catch { /* ignore */ }
      }
      const uploaded = await storageApi.uploadFile(file, { entityType: 'order' });
      setValue('notesImageId', uploaded.id, { shouldDirty: true });
      setNotesImagePreview(uploaded.url);
      enqueueSnackbar('Imagen subida exitosamente', { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(error.response?.data?.message || 'Error al subir la imagen', { variant: 'error' });
    } finally {
      setNotesImageUploading(false);
    }
  };

  const handleNotesImageDelete = async () => {
    const existing = getValues('notesImageId');
    if (!isEdit && existing) {
      try { await storageApi.deleteFile(existing); } catch { /* ignore */ }
    }
    setValue('notesImageId', null, { shouldDirty: true });
    setNotesImagePreview(null);
    enqueueSnackbar('Imagen eliminada', { variant: 'success' });
  };

  const handleNotesImagePaste = (e: React.ClipboardEvent) => {
    const fileItem = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (fileItem) {
      const file = fileItem.getAsFile();
      if (file) {
        e.preventDefault();
        handleNotesImageUpload(file);
      }
    }
  };

  const renderStep1 = () => (
    <Stack spacing={3}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Ítems de la Orden
          </Typography>
          <Divider sx={{ mb: 3 }} />

          <Stack spacing={3}>
            {!isClientSelected && (
              <Typography variant="body2" color="text.secondary">
                Primero debe seleccionar un cliente para agregar ítems a la orden.
              </Typography>
            )}

            <Controller
              name="items"
              control={control}
              render={({ field }) => (
                <OrderItemsTable
                  items={field.value}
                  onChange={field.onChange}
                  errors={errors}
                  disabled={!isClientSelected}
                  orderId={isEdit ? id : undefined}
                  onImageUpload={handleImageUpload}
                  onImageDelete={handleImageDelete}
                />
              )}
            />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );

  const renderStep2 = () => (
    <Stack spacing={3}>
      {/* Prueba de color */}
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Prueba de Color
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6}>
              <Controller
                name="requiresColorProof"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        disabled={!isClientSelected}
                        id="requiresColorProof"
                      />
                    }
                    label={
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        ¿Requiere prueba de color?
                      </Typography>
                    }
                  />
                )}
              />
            </Grid>
            {requiresColorProof && (
              <Grid item xs={12} sm={6}>
                <Controller
                  name="colorProofPrice"
                  control={control}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Valor de la prueba de color"
                      size="small"
                      disabled={!isClientSelected}
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                      InputProps={{
                        startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                        inputProps: { inputMode: 'numeric' },
                      }}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        if (raw === '') { field.onChange(undefined); return; }
                        const val = parseInt(raw, 10);
                        field.onChange(isNaN(val) ? undefined : val);
                      }}
                      value={field.value !== undefined ? formatCurrencyInput(field.value.toString()) : ''}
                    />
                  )}
                />
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      <Controller
        name="applyTax"
        control={control}
        render={({ field: applyTaxField }) => (
          <Controller
            name="taxRate"
            control={control}
            render={({ field: taxRateField }) => (
              <OrderTotals
                items={items}
                applyTax={applyTaxField.value}
                taxRate={taxRateField.value}
                requiresColorProof={requiresColorProof}
                colorProofPrice={colorProofPrice}
                onApplyTaxChange={applyTaxField.onChange}
                onTaxRateChange={taxRateField.onChange}
                disabled={!isClientSelected}
                applyWithholdings={applyWithholdings}
                retefuenteRate={retefuenteActualRate}
                reteICARate={reteICAActualRate}
                reteIVARate={reteIVAActualRate}
              />
            )}
          />
        )}
      />

      {/* Retenciones */}
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Retenciones
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Controller
            name="applyWithholdings"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={field.value}
                    onChange={(e) => {
                      field.onChange(e.target.checked);
                      if (!e.target.checked) {
                        setValue('retefuente', '');
                        setValue('retefuenteCustom', '');
                        setValue('reteICA', '');
                        setValue('reteIVA', '');
                      }
                    }}
                    disabled={!isClientSelected || !applyTax}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      Aplicar Retenciones
                    </Typography>
                    {!applyTax && isClientSelected && (
                      <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                        Debe activar el IVA para aplicar retenciones
                      </Typography>
                    )}
                  </Box>
                }
              />
            )}
          />
          {errors.applyWithholdings && (
            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block', mt: 0.5 }}>
              {errors.applyWithholdings.message}
            </Typography>
          )}

          {applyWithholdings && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {/* Retefuente select */}
              <Grid item xs={12} sm={6} md={4}>
                <Controller
                  name="retefuente"
                  control={control}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      select
                      fullWidth
                      size="small"
                      label="Retefuente"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                      disabled={!isClientSelected}
                    >
                      <MenuItem value="">Sin seleccionar</MenuItem>
                      {RETEFUENTE_OPTIONS.map((opt) => (
                        <MenuItem key={opt} value={opt}>
                          {opt}%
                        </MenuItem>
                      ))}
                      <MenuItem value="other">Otro</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>

              {/* Retefuente custom (cuando se selecciona "Otro") */}
              {retefuente === 'other' && (
                <Grid item xs={12} sm={6} md={4}>
                  <Controller
                    name="retefuenteCustom"
                    control={control}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        fullWidth
                        size="small"
                        label="Retefuente personalizado (%)"
                        type="number"
                        inputProps={{ step: '0.1', min: '0' }}
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message || 'Ingrese el porcentaje'}
                        disabled={!isClientSelected}
                      />
                    )}
                  />
                </Grid>
              )}

              {/* ReteICA select */}
              <Grid item xs={12} sm={6} md={4}>
                <Controller
                  name="reteICA"
                  control={control}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      select
                      fullWidth
                      size="small"
                      label="ReteICA"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                      disabled={!isClientSelected}
                    >
                      <MenuItem value="">Sin seleccionar</MenuItem>
                      <MenuItem value="0.414">0.414%</MenuItem>
                      <MenuItem value="0.692">0.692%</MenuItem>
                      <MenuItem value="0.966">0.966%</MenuItem>
                      <MenuItem value="1.104">1.104%</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>

              {/* ReteIVA select */}
              <Grid item xs={12} sm={6} md={4}>
                <Controller
                  name="reteIVA"
                  control={control}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      select
                      fullWidth
                      size="small"
                      label="ReteIVA"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                      disabled={!isClientSelected}
                    >
                      <MenuItem value="">Sin seleccionar</MenuItem>
                      <MenuItem value="15">15%</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {saldoAFavor > 0 && total > 0 && (
        <Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <FormControlLabel
              control={
                <Controller
                  name="useCreditBalance"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      {...field}
                      checked={field.value || false}
                      // Comentamos disabled={isEdit} para que en editar se pueda ver, o mejor, si isEdit, no dejar cambiar
                      disabled={isEdit}
                    />
                  )}
                />
              }
              label={
                <Typography variant="body1" fontWeight={600}>
                  Usar saldo a favor del cliente ({formatCurrency(saldoAFavor)})
                </Typography>
              }
            />
            {useCreditBalance && (
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                Se descontará automáticamente del total a pagar (aplica hasta {formatCurrency(Math.min(saldoAFavor, total))}).
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {isEdit && isAdvanceRejected && (
        <Alert severity="warning">
          <strong>El anticipo de esta orden fue rechazado por Caja</strong> y el pago
          quedó revertido. Registra aquí el abono corregido: al guardar se enviará de
          nuevo a Caja para su autorización.
          {orderQuery.data?.advancePaymentRejectedReason && (
            <>
              {' '}Motivo del rechazo: <em>{orderQuery.data.advancePaymentRejectedReason}</em>
            </>
          )}
        </Alert>
      )}

      {isEdit && !canEditPaymentHere && (
        <Alert severity="info">
          Los abonos no se editan desde aquí. Para corregir un pago o su comprobante
          usa <strong>Historial de Pagos</strong> en el detalle de la orden (requiere
          autorización del administrador).
        </Alert>
      )}
      <Controller
        name="payments"
        control={control}
        render={({ field: paymentsField }) => (
          <InitialPayment
            total={remainingTotalAfterCredit}
            enabled={true}
            values={paymentsField.value}
            onEnabledChange={() => {}}
            onChange={paymentsField.onChange}
            disabled={!isClientSelected || (isEdit && !canEditPaymentHere)}
            required={true}
            creditBalance={saldoAFavor}
            clientIsEmployee={Boolean(selectedClient?.employeeId)}
          />
        )}
      />
    </Stack>
  );

  const renderStep3 = () => (
    <Stack spacing={3}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Observaciones y Confirmar
          </Typography>
          <Divider sx={{ mb: 3 }} />

          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                multiline
                rows={4}
                label="Notas u Observaciones"
                placeholder="Agregue cualquier información adicional sobre esta orden..."
                helperText={
                  isClientSelected
                    ? 'Opcional: instrucciones especiales, detalles importantes, etc.'
                    : 'Primero seleccione un cliente'
                }
                disabled={!isClientSelected}
              />
            )}
          />

          {/* Imagen adjunta a observaciones */}
          <Box sx={{ mt: 2 }} onPaste={isClientSelected ? handleNotesImagePaste : undefined}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Imagen de referencia (opcional)
            </Typography>
            <input
              ref={notesImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleNotesImageUpload(file);
                e.target.value = '';
              }}
            />

            {notesImageUploading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Subiendo imagen...
                </Typography>
              </Stack>
            ) : notesImageId ? (
              <Stack direction="row" spacing={1.5} alignItems="center">
                {notesImagePreview ? (
                  <Box
                    component="img"
                    src={notesImagePreview}
                    alt="Imagen de observaciones"
                    onClick={() => notesImagePreview && window.open(notesImagePreview, '_blank')}
                    sx={{
                      width: 72,
                      height: 72,
                      objectFit: 'cover',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'grey.300',
                      cursor: 'pointer',
                      transition: 'opacity 0.2s',
                      '&:hover': { opacity: 0.8 },
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 72,
                      height: 72,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'grey.300',
                      bgcolor: 'grey.50',
                    }}
                  >
                    <ImageIcon color="disabled" />
                  </Box>
                )}
                {notesImagePreview && (
                  <Tooltip title="Ver imagen">
                    <IconButton size="small" onClick={() => window.open(notesImagePreview, '_blank')}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Eliminar imagen">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={handleNotesImageDelete}
                    disabled={!isClientSelected}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ) : (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddPhotoAlternateIcon />}
                onClick={() => notesImageInputRef.current?.click()}
                disabled={!isClientSelected}
              >
                Adjuntar imagen
              </Button>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Puede adjuntar o pegar una imagen (JPG, PNG, GIF o WEBP).
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Resumen */}
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Resumen
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={0.5}>
            <Typography variant="body2">
              <strong>Cliente:</strong> {selectedClient?.name ?? '—'}
            </Typography>
            <Typography variant="body2">
              <strong>Canal:</strong>{' '}
              {channels.find((c) => c.id === watch('commercialChannelId'))?.name ?? '—'}
            </Typography>
            <Typography variant="body2">
              <strong>Ítems:</strong> {items.length}
            </Typography>
            <Typography variant="body2">
              <strong>Subtotal:</strong> {formatCurrency(subtotal)}
            </Typography>
            {applyTax && (
              <Typography variant="body2">
                <strong>IVA ({taxRate}%):</strong> {formatCurrency(tax)}
              </Typography>
            )}
            {applyWithholdings && retefuenteAmount > 0 && (
              <Typography variant="body2">
                <strong>Retefuente ({retefuenteActualRate}%):</strong> - {formatCurrency(retefuenteAmount)}
              </Typography>
            )}
            {applyWithholdings && reteICAAmount > 0 && (
              <Typography variant="body2">
                <strong>ReteICA ({reteICAActualRate}%):</strong> - {formatCurrency(reteICAAmount)}
              </Typography>
            )}
            {applyWithholdings && reteIVAAmount > 0 && (
              <Typography variant="body2">
                <strong>ReteIVA ({reteIVAActualRate}%):</strong> - {formatCurrency(reteIVAAmount)}
              </Typography>
            )}
            {requiresColorProof && (
              <Typography variant="body2">
                <strong>Prueba de color:</strong> {formatCurrency(colorProofPrice)}
              </Typography>
            )}
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="body2" fontWeight={700}>
              <strong>Total:</strong> {formatCurrency(total)}
            </Typography>
            <Divider sx={{ my: 0.5 }} />
            {useCreditBalance && creditBalanceUsed > 0 && (
              <Typography variant="body2" color="success.main" fontWeight={600}>
                <strong>Saldo a favor utilizado:</strong> - {formatCurrency(creditBalanceUsed)}
              </Typography>
            )}
            {watch('payments').map((p, i) => (
              <Typography key={i} variant="body2" color="primary.main" fontWeight={600}>
                <strong>Anticipo {watch('payments').length > 1 ? i + 1 : ''}:</strong>{' '}
                {formatCurrency(p.amount || 0)}{' '}
                <Typography component="span" variant="body2" color="text.secondary" fontWeight={400}>
                  ({
                    paymentMethodLabel(p.paymentMethod)
                  })
                </Typography>
              </Typography>
            ))}
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="body2" color="error.main" fontWeight={700}>
              <strong>Saldo por pagar:</strong>{' '}
              {formatCurrency(total - creditBalanceUsed - watch('payments').reduce((sum, p) => sum + (p.amount || 0), 0))}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      {isSubmitting && (
        <LoadingSpinner fullScreen message={isEdit ? 'Guardando cambios...' : 'Creando orden...'} />
      )}

      <PageHeader
        title={isEdit ? 'Editar Orden' : 'Nueva Orden de Pedido'}
        breadcrumbs={[
          { label: 'Órdenes', path: '/orders' },
          { label: isEdit ? 'Editar' : 'Nueva' },
        ]}
      />

      {isEdit && id && <ActivePermissionBanner orderId={id} />}

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
                  activeStep === 0 ? navigate('/orders') : goToStep(activeStep - 1)
                }
                disabled={isSubmitting}
                fullWidth={false}
              >
                {activeStep === 0 ? 'Cancelar' : 'Anterior'}
              </Button>

              {activeStep < STEPS.length - 1 ? (
                <Button
                  variant="contained"
                  onClick={() => goToStep(activeStep + 1)}
                  disabled={!canGoNext() || isSubmitting}
                >
                  Siguiente
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<SaveIcon />}
                  disabled={isSubmitting || !canSave}
                  onClick={handleSubmit(onSubmit, onInvalid)}
                >
                  {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Orden'}
                </Button>
              )}
            </Stack>
          </Box>
      </Box>
    </Box>
  );
};

export default OrderFormPage;
