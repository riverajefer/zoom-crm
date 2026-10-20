import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import {
  Box,
  Button,
  Stack,
  Typography,
  TextField,
  Autocomplete,
  Divider,
  CircularProgress,
  Alert,
  MenuItem,
  IconButton,
  Card,
  CardContent,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Chip,
  Grid,
  alpha,
  useTheme,
  Dialog,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  CheckCircle as CheckCircleIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Category as CategoryIcon,
  Person as PersonIcon,
  ReceiptLong as ReceiptLongIcon,
  Notes as NotesIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  Image as ImageIcon,
  TaskAlt as TaskAltIcon,
  ManageAccounts as ManageAccountsIcon,
  AccountBalance as AccountBalanceIcon,
  EastRounded as EastRoundedIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { PageHeader } from '../../../components/common/PageHeader';
import { BankSelector } from '../../../components/common/BankSelector';
import { WithholdingsFields } from '../../../components/common/WithholdingsFields';
import {
  EMPTY_WITHHOLDINGS,
  computeExpenseTotals,
  getWithholdingPercentages,
  isWithholdingsSelectionEmpty,
  toWithholdingRates,
  withholdingsFromRates,
  type WithholdingsValue,
} from '../../../utils/withholdings';
import { useExpenseOrders, useExpenseOrder, useExpenseTypes, usePaidExpenseOrderEdit } from '../hooks';
import { useUsers } from '../../users/hooks/useUsers';
import { useWorkOrder } from '../../work-orders/hooks';
import type { WorkOrder } from '../../../types/work-order.types';
import { WorkOrderSearchAutocomplete } from '../components/WorkOrderSearchAutocomplete';
import { useProductionAreas } from '../../production-areas/hooks/useProductionAreas';
import { useSuppliers } from '../../suppliers/hooks/useSuppliers';
import { CreateSupplierModal } from '../../suppliers/components/CreateSupplierModal';
import { CreateProductionAreaModal } from '../../production-areas/components/CreateProductionAreaModal';
import { storageApi } from '../../../api/storage.api';
import { ROUTES } from '../../../utils/constants';
import { formatCurrency } from '../../../utils/formatters';
import {
  formatCurrencyInput,
  parseCurrencyInput,
  sanitizeCurrencyInput,
  toCurrencyInputValue,
} from '../../../utils/currencyInput';
import {
  PaymentMethod,
  PAYMENT_METHOD_LABELS,
  ExpenseOrderStatus,
  type CreateExpenseItemDto,
  type CreateExpenseOrderDto,
  type UpdateExpenseOrderDto,
} from '../../../types/expense-order.types';

// ─── Item form shape ──────────────────────────────────────────────────────────

interface ExpenseItemForm {
  quantity: string;
  name: string;
  description: string;
  supplierId: string;
  supplierLabel: string;
  unitPrice: string;
  paymentMethod: PaymentMethod;
  bankEntity: string | null;
  productionAreaIds: string[];
  receiptFileId: string;
  referenceFileId: string;
}

const defaultItem = (): ExpenseItemForm => ({
  quantity: '1',
  name: '',
  description: '',
  supplierId: '',
  supplierLabel: '',
  unitPrice: '',
  paymentMethod: PaymentMethod.CASH,
  bankEntity: null,
  productionAreaIds: [],
  receiptFileId: '',
  referenceFileId: '',
});

// ─── Step config ──────────────────────────────────────────────────────────────

interface StepConfig {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}

const STEPS: StepConfig[] = [
  { label: 'Tipo de Gasto', subtitle: 'Categoría y OT asociada', icon: <CategoryIcon fontSize="small" /> },
  { label: 'Autorización', subtitle: 'Responsables y observaciones', icon: <PersonIcon fontSize="small" /> },
  { label: 'Ítems de Gasto', subtitle: 'Detalle de gastos y pagos', icon: <ReceiptLongIcon fontSize="small" /> },
  { label: 'Confirmar', subtitle: 'Resumen y guardar', icon: <NotesIcon fontSize="small" /> },
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

  const successGreen = theme.palette.success.dark; // #10B981 — verde real del tema

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

// ─── Main Component ───────────────────────────────────────────────────────────

export const ExpenseOrderFormPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { enqueueSnackbar } = useSnackbar();
  const isEditing = !!id;

  const [activeStep, setActiveStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([0]));

  // ─── Post-creation info dialog ──────────────────────────────────────────────
  const [createdOg, setCreatedOg] = useState<{ id: string; ogNumber: string } | null>(null);

  // ─── Create Supplier Modal ──────────────────────────────────────────────────
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierModalTargetIndex, setSupplierModalTargetIndex] = useState<number | null>(null);

  const handleCreateSupplierSuccess = (newSupplier: { id: string; name: string }) => {
    if (supplierModalTargetIndex !== null) {
      updateItem(supplierModalTargetIndex, 'supplierId', newSupplier.id);
      updateItem(supplierModalTargetIndex, 'supplierLabel', newSupplier.name);
    }
    setSupplierModalOpen(false);
    setSupplierModalTargetIndex(null);
  };

  // ─── Create Production Area Modal ───────────────────────────────────────────
  const [productionAreaModalOpen, setProductionAreaModalOpen] = useState(false);
  const [productionAreaModalTargetIndex, setProductionAreaModalTargetIndex] = useState<
    number | null
  >(null);

  const handleCreateProductionAreaSuccess = (newArea: { id: string; name: string }) => {
    if (productionAreaModalTargetIndex !== null) {
      updateItem(productionAreaModalTargetIndex, 'productionAreaIds', [newArea.id]);
    }
    setProductionAreaModalOpen(false);
    setProductionAreaModalTargetIndex(null);
  };

  // ─── Step 1: Type & OT ──────────────────────────────────────────────────────
  const [expenseTypeId, setExpenseTypeId] = useState('');
  const [expenseSubcategoryId, setExpenseSubcategoryId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');

  // ─── Step 2: Authorization ──────────────────────────────────────────────────
  const [authorizedToId, setAuthorizedToId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [observations, setObservations] = useState('');
  const [areaOrMachine, setAreaOrMachine] = useState('');

  // ─── IVA (opcional, nivel orden) ─────────────────────────────────────────────
  const [applyIva, setApplyIva] = useState(false);
  const [ivaPercentage, setIvaPercentage] = useState(19); // porcentaje en UI (19 = 19%)

  // ─── Retenciones (opcional, nivel orden) ────────────────────────────────────
  const [withholdings, setWithholdings] = useState<WithholdingsValue>(EMPTY_WITHHOLDINGS);

  // ─── Step 3: Items ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<ExpenseItemForm[]>([defaultItem()]);
  // receiptFiles[i] and referenceFiles[i] hold the File selected for items[i] (not yet uploaded)
  const [receiptFiles, setReceiptFiles] = useState<(File | null)[]>([null]);
  const [referenceFiles, setReferenceFiles] = useState<(File | null)[]>([null]);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const referenceFileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const prefillAppliedRef = useRef(false);
  // Identidad de este formulario. Viaja en el POST para que, si igual se cuelan
  // dos peticiones (reintento de axios, red intermitente), el backend devuelva
  // la misma OG en vez de crear una gemela.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  // ─── Data queries ───────────────────────────────────────────────────────────
  const { data: expenseTypes = [], isLoading: loadingTypes } = useExpenseTypes();
  // La OT elegida en el buscador ya trae sus datos; si solo conocemos el ID
  // (precarga desde el detalle de la OT, o edición) se resuelve por ID.
  const [pickedWorkOrder, setPickedWorkOrder] = useState<WorkOrder | null>(null);
  const needsWorkOrderLookup = !!workOrderId && pickedWorkOrder?.id !== workOrderId;
  const { workOrderQuery: resolvedWorkOrderQuery } = useWorkOrder(
    needsWorkOrderLookup ? workOrderId : undefined,
  );
  const selectedWorkOrder = !workOrderId
    ? null
    : pickedWorkOrder?.id === workOrderId
      ? pickedWorkOrder
      : (resolvedWorkOrderQuery.data ?? null);
  const resolvingWorkOrder = needsWorkOrderLookup && resolvedWorkOrderQuery.isLoading;
  const { usersQuery } = useUsers();
  const users = usersQuery.data ?? [];
  const { productionAreasQuery } = useProductionAreas();
  const productionAreas = productionAreasQuery.data ?? [];
  const { suppliersQuery } = useSuppliers();
  const suppliers = suppliersQuery.data ?? [];

  // ─── Edit: load existing OG ──────────────────────────────────────────────────
  const { expenseOrderQuery } = useExpenseOrder(id);
  const existingOG = expenseOrderQuery.data;

  // Una OG pagada se corrige con autorización del admin. Sus ítems ya salieron
  // de caja: no se quitan ni se les cambia método de pago, banco o comprobante
  // (el backend lo vuelve a validar). Se pueden agregar ítems y corregir montos.
  const paidEdit = usePaidExpenseOrderEdit(isEditing ? existingOG : undefined);
  const lockedItemCount = isEditing && paidEdit.isPaid ? existingOG?.items.length ?? 0 : 0;
  const isItemLocked = (index: number) => index < lockedItemCount;

  useEffect(() => {
    if (existingOG) {
      setExpenseTypeId(existingOG.expenseType.id);
      setExpenseSubcategoryId(existingOG.expenseSubcategory.id);
      setWorkOrderId(existingOG.workOrder?.id ?? '');
      setAuthorizedToId(existingOG.authorizedTo?.id ?? '');
      setResponsibleId(existingOG.responsible?.id ?? '');
      setObservations(existingOG.observations ?? '');
      setAreaOrMachine(existingOG.areaOrMachine ?? '');
      setApplyIva(existingOG.applyIva ?? false);
      setIvaPercentage(
        existingOG.applyIva ? Math.round(Number(existingOG.ivaRate) * 100) : 19,
      );
      setWithholdings(withholdingsFromRates(existingOG));
      if (existingOG.items.length) {
        setItems(
          existingOG.items.map((item) => ({
            quantity: item.quantity,
            name: item.name,
            description: item.description ?? '',
            supplierId: item.supplier?.id ?? '',
            supplierLabel: item.supplier?.name ?? '',
            unitPrice: toCurrencyInputValue(item.unitPrice),
            paymentMethod: item.paymentMethod,
            bankEntity: item.bankEntity ?? null,
            productionAreaIds: item.productionAreas.map((pa) => pa.productionArea.id),
            receiptFileId: item.receiptFileId ?? '',
            referenceFileId: item.referenceFileId ?? '',
          })),
        );
        // Initialize receiptFiles and referenceFiles arrays with nulls (no new files selected yet)
        setReceiptFiles(existingOG.items.map(() => null));
        setReferenceFiles(existingOG.items.map(() => null));
      }
      // En edición, todos los pasos ya fueron completados previamente
      setVisitedSteps(new Set([0, 1, 2, 3]));
    }
  }, [existingOG]);

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const { createExpenseOrderMutation } = useExpenseOrders();
  const { updateExpenseOrderMutation } = useExpenseOrder(id);

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const selectedType = expenseTypes.find((t) => t.id === expenseTypeId);
  const subcategories = selectedType?.subcategories ?? [];
  const isProduccionType = selectedType?.name?.toLowerCase() === 'producción';

  const normalizeText = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // ─── Prefill desde detalle de OT (solo en creación) ─────────────────────────
  useEffect(() => {
    if (isEditing || prefillAppliedRef.current || expenseTypes.length === 0) {
      return;
    }

    const queryParams = new URLSearchParams(location.search);
    const prefillWorkOrderId = queryParams.get('workOrderId');
    if (!prefillWorkOrderId) {
      prefillAppliedRef.current = true;
      return;
    }

    const productionType = expenseTypes.find(
      (type) => normalizeText(type.name) === 'produccion',
    );

    if (!productionType) {
      prefillAppliedRef.current = true;
      return;
    }

    const directCostSubcategory =
      productionType.subcategories?.find(
        (subcategory) =>
          normalizeText(subcategory.name) ===
          'costos directos de orden de trabajo',
      ) ?? null;

    setExpenseTypeId(productionType.id);
    if (directCostSubcategory) {
      setExpenseSubcategoryId(directCostSubcategory.id);
    }
    setWorkOrderId(prefillWorkOrderId);
    prefillAppliedRef.current = true;
  }, [expenseTypes, isEditing, location.search]);

  const totalAmount = useMemo(() => {
    return items.reduce((acc, item) => {
      const q = parseFloat(item.quantity) || 0;
      const p = parseCurrencyInput(item.unitPrice);
      return acc + q * p;
    }, 0);
  }, [items]);

  // `totalAmount` es el subtotal de los ítems; el total a pagar le suma el IVA
  // y le resta las retenciones, con la misma cuenta que hace el backend.
  const totals = useMemo(
    () => computeExpenseTotals(totalAmount, { applyIva, ivaPercentage, withholdings }),
    [applyIva, ivaPercentage, totalAmount, withholdings],
  );
  const withholdingPercentages = getWithholdingPercentages(withholdings);
  const ivaAmount = totals.ivaAmount;
  const grandTotal = totals.total;
  const hasWithholdings =
    totals.retefuenteAmount > 0 || totals.reteICAAmount > 0 || totals.reteIVAAmount > 0;
  const withholdingsError = isWithholdingsSelectionEmpty(withholdings)
    ? 'Debe configurar al menos una retención'
    : undefined;

  // ─── Item helpers ─────────────────────────────────────────────────────────────
  const addItem = () => {
    setItems((prev) => [...prev, defaultItem()]);
    setReceiptFiles((prev) => [...prev, null]);
    setReferenceFiles((prev) => [...prev, null]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
    setReferenceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ExpenseItemForm, value: unknown) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const setReceiptFileForItem = (index: number, file: File | null) => {
    setReceiptFiles((prev) => prev.map((f, i) => (i === index ? file : f)));
  };

  const clearReceiptForItem = (index: number) => {
    setReceiptFileForItem(index, null);
    updateItem(index, 'receiptFileId', '');
    if (fileInputRefs.current[index]) {
      fileInputRefs.current[index]!.value = '';
    }
  };

  const setReferenceFileForItem = (index: number, file: File | null) => {
    setReferenceFiles((prev) => prev.map((f, i) => (i === index ? file : f)));
  };

  const clearReferenceForItem = (index: number) => {
    setReferenceFileForItem(index, null);
    updateItem(index, 'referenceFileId', '');
    if (referenceFileInputRefs.current[index]) {
      referenceFileInputRefs.current[index]!.value = '';
    }
  };

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  const handleReceiptFileChange = (index: number, file: File | null) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return;
    setReceiptFileForItem(index, file);
    updateItem(index, 'receiptFileId', '');
  };

  const handleReferenceFileChange = (index: number, file: File | null) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return;
    setReferenceFileForItem(index, file);
    updateItem(index, 'referenceFileId', '');
  };

  const handlePasteForItem = (index: number, e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (let i = 0; i < clipItems.length; i++) {
      if (clipItems[i].type.indexOf('image') !== -1) {
        const file = clipItems[i].getAsFile();
        if (file) {
          const extension = file.type.split('/')[1] || 'png';
          const newFile = new File([file], `pasted-image-${Date.now()}.${extension}`, { type: file.type });
          handleReceiptFileChange(index, newFile);
          e.preventDefault();
          break;
        }
      }
    }
  };

  const handlePasteReferenceForItem = (index: number, e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (let i = 0; i < clipItems.length; i++) {
      if (clipItems[i].type.indexOf('image') !== -1) {
        const file = clipItems[i].getAsFile();
        if (file) {
          const extension = file.type.split('/')[1] || 'png';
          const newFile = new File([file], `pasted-image-${Date.now()}.${extension}`, { type: file.type });
          handleReferenceFileChange(index, newFile);
          e.preventDefault();
          break;
        }
      }
    }
  };

  // ─── Validation per step ──────────────────────────────────────────────────────
  const isStep1Valid = !!expenseTypeId && !!expenseSubcategoryId;
  // El empleado "Se autoriza a" es opcional; el paso de autorización no bloquea.
  const isStep2Valid = true;
  const isStep3Valid = items.every(
    (item) =>
      item.name.trim() &&
      parseFloat(item.quantity) > 0 &&
      parseCurrencyInput(item.unitPrice) > 0,
  );

  // ─── Submit ───────────────────────────────────────────────────────────────────

  /**
   * Upload any pending receipt and reference files, returning resolved IDs per item.
   */
  const uploadPendingFiles = async (): Promise<{
    receiptFileIds: (string | undefined)[];
    referenceFileIds: (string | undefined)[];
  }> => {
    const [receiptFileIds, referenceFileIds] = await Promise.all([
      Promise.all(
        items.map(async (item, index) => {
          const file = receiptFiles[index];
          if (file) {
            const uploaded = await storageApi.uploadFile(file, { entityType: 'expense_order' });
            return uploaded.id;
          }
          return item.receiptFileId || undefined;
        }),
      ),
      Promise.all(
        items.map(async (item, index) => {
          const file = referenceFiles[index];
          if (file) {
            const uploaded = await storageApi.uploadFile(file, { entityType: 'expense_order' });
            return uploaded.id;
          }
          return item.referenceFileId || undefined;
        }),
      ),
    ]);
    return { receiptFileIds, referenceFileIds };
  };

  const buildPayload = (
    resolvedReceiptIds: (string | undefined)[],
    resolvedReferenceIds: (string | undefined)[],
  ): CreateExpenseOrderDto => ({
    expenseTypeId,
    expenseSubcategoryId,
    workOrderId: workOrderId || undefined,
    authorizedToId: authorizedToId || undefined,
    responsibleId: responsibleId || undefined,
    observations: observations || undefined,
    areaOrMachine: areaOrMachine || undefined,
    applyIva,
    ivaRate: applyIva ? ivaPercentage / 100 : undefined,
    ...toWithholdingRates(applyIva ? withholdings : EMPTY_WITHHOLDINGS),
    items: items.map((item, index) => ({
      quantity: parseFloat(item.quantity),
      name: item.name.trim(),
      description: item.description || undefined,
      supplierId: item.supplierId || undefined,
      unitPrice: parseCurrencyInput(item.unitPrice),
      paymentMethod: item.paymentMethod,
      bankEntity: item.paymentMethod === PaymentMethod.TRANSFER ? item.bankEntity ?? null : null,
      productionAreaIds: item.productionAreaIds.length
        ? item.productionAreaIds
        : undefined,
      receiptFileId: resolvedReceiptIds[index],
      referenceFileId: resolvedReferenceIds[index],
    })) as CreateExpenseItemDto[],
  });

  /**
   * Avisa de lo que falla ANTES de la mutación —una subida de archivo, por
   * ejemplo—, que es lo único que no anuncia el `onError` de la mutación.
   */
  const reportPreflightError = (error: unknown) => {
    const isApiError =
      typeof error === 'object' && error !== null && 'response' in error;
    if (!isApiError) {
      enqueueSnackbar('No se pudo guardar la orden de gasto. Intenta de nuevo.', {
        variant: 'error',
      });
    }
  };

  const handleSaveDraft = useSingleFlight(async () => {
    try {
      const { receiptFileIds, referenceFileIds } = await uploadPendingFiles();
      const payload = buildPayload(receiptFileIds, referenceFileIds);
      if (isEditing) {
        await updateExpenseOrderMutation.mutateAsync({ id: id!, dto: payload as UpdateExpenseOrderDto });
        navigate(ROUTES.EXPENSE_ORDERS_DETAIL.replace(':id', id!));
      } else {
        const og = await createExpenseOrderMutation.mutateAsync({
          dto: { ...payload, idempotencyKey: idempotencyKeyRef.current },
        });
        navigate(ROUTES.EXPENSE_ORDERS_DETAIL.replace(':id', og.id));
      }
    } catch (error) {
      reportPreflightError(error);
      throw error;
    }
  });

  const handleCreate = useSingleFlight(async () => {
    try {
      const { receiptFileIds, referenceFileIds } = await uploadPendingFiles();
      const payload = buildPayload(receiptFileIds, referenceFileIds);
      if (isEditing) {
        await updateExpenseOrderMutation.mutateAsync({ id: id!, dto: payload as UpdateExpenseOrderDto });
        navigate(ROUTES.EXPENSE_ORDERS_DETAIL.replace(':id', id!));
      } else {
        const og = await createExpenseOrderMutation.mutateAsync({
          dto: { ...payload, idempotencyKey: idempotencyKeyRef.current },
          confirmed: true,
        });
        // Show informational dialog before navigating
        setCreatedOg({ id: og.id, ogNumber: og.ogNumber });
      }
    } catch (error) {
      reportPreflightError(error);
      throw error;
    }
  });

  const handleCreatedDialogClose = () => {
    if (createdOg) {
      navigate(ROUTES.EXPENSE_ORDERS_DETAIL.replace(':id', createdOg.id));
    }
  };

  const isSubmitting =
    createExpenseOrderMutation.isPending || updateExpenseOrderMutation.isPending;

  // ─── Loading state for edit ───────────────────────────────────────────────────
  if (isEditing && expenseOrderQuery.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  if (isEditing && paidEdit.isPaid && paidEdit.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  if (
    isEditing &&
    existingOG &&
    existingOG.status !== ExpenseOrderStatus.DRAFT &&
    existingOG.status !== ExpenseOrderStatus.CREATED &&
    !paidEdit.canEditPaidNow
  ) {
    return (
      <Box>
        <PageHeader title="Editar OG" />
        <Alert severity="warning">
          {paidEdit.isPaid
            ? 'Esta OG ya está pagada. Para corregirla, pide autorización al administrador desde el detalle de la OG (botón «Solicitar edición»).'
            : `Esta OG no se puede editar en su estado actual (${existingOG.status}).`}
        </Alert>
      </Box>
    );
  }

  // ─── Steps render ─────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <Stack spacing={3}>
      <Typography variant="h6" fontWeight={600}>
        Clasificación del Gasto
      </Typography>

      <Autocomplete
        options={expenseTypes.filter((t) => t.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'produccion')}
        getOptionLabel={(opt) => opt.name}
        value={expenseTypes.find((t) => t.id === expenseTypeId) ?? null}
        onChange={(_, val) => {
          const newType = val?.name?.toLowerCase();
          setExpenseTypeId(val?.id ?? '');
          setExpenseSubcategoryId('');
          if (newType !== 'producción') {
            setWorkOrderId('');
          }
        }}
        loading={loadingTypes}
        renderInput={(params) => (
          <TextField {...params} label="Tipo de gasto *" placeholder="Seleccionar tipo..." />
        )}
      />

      <Autocomplete
        options={subcategories}
        getOptionLabel={(opt) => opt.name}
        value={subcategories.find((s) => s.id === expenseSubcategoryId) ?? null}
        onChange={(_, val) => setExpenseSubcategoryId(val?.id ?? '')}
        disabled={!expenseTypeId}
        renderInput={(params) => (
          <TextField {...params} label="Subcategoría *" placeholder="Seleccionar subcategoría..." />
        )}
      />

      {isProduccionType && (
        <WorkOrderSearchAutocomplete
          value={selectedWorkOrder}
          loadingValue={resolvingWorkOrder}
          onChange={(wo) => {
            setPickedWorkOrder(wo);
            setWorkOrderId(wo?.id ?? '');
          }}
        />
      )}

      <Autocomplete
        options={productionAreas.filter((pa) => pa.isActive !== false)}
        getOptionLabel={(pa) => pa.name}
        value={productionAreas.find((pa) => pa.name === areaOrMachine) ?? null}
        onChange={(_, val) => setAreaOrMachine(val?.name ?? '')}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Área encargada o máquina"
            placeholder="Seleccionar área de producción..."
          />
        )}
      />
    </Stack>
  );

  const renderStep2 = () => (
    <Stack spacing={3}>
      <Typography variant="h6" fontWeight={600}>
        Datos de Autorización
      </Typography>

      <Autocomplete
        options={users}
        getOptionLabel={(u) =>
          `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.username || ''
        }
        value={users.find((u) => u.id === authorizedToId) ?? null}
        onChange={(_, val) => setAuthorizedToId(val?.id ?? '')}
        renderInput={(params) => (
          <TextField {...params} label="Se autoriza a (opcional)" placeholder="Seleccionar usuario..." />
        )}
      />

      <Autocomplete
        options={users}
        getOptionLabel={(u) =>
          `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.username || ''
        }
        value={users.find((u) => u.id === responsibleId) ?? null}
        onChange={(_, val) => setResponsibleId(val?.id ?? '')}
        renderInput={(params) => (
          <TextField {...params} label="Responsable (opcional)" placeholder="Seleccionar usuario..." />
        )}
      />

    </Stack>
  );

  const renderStep3 = () => (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={{ xs: 1, sm: 0 }}>
        <Typography variant="h6" fontWeight={600}>
          Ítems de Gasto
        </Typography>
        <Button startIcon={<AddIcon />} onClick={addItem} variant="outlined" color='primary' size="small">
          Agregar ítem
        </Button>
      </Stack>

      {items.map((item, index) => (
        <Card key={index} variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={600}>
                  Ítem {index + 1}
                </Typography>
                {items.length > 1 && !isItemLocked(index) && (
                  <IconButton size="small" color="error" onClick={() => removeItem(index)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>

              <TextField
                label="Nombre del gasto *"
                value={item.name}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
                inputProps={{ maxLength: 200 }}
                fullWidth
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="stretch">
                <TextField
                  label="Cantidad *"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                  inputProps={{ min: 0.01, step: 0.01 }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Precio unitario *"
                  value={item.unitPrice ? formatCurrencyInput(item.unitPrice) : ''}
                  onChange={(e) => {
                    updateItem(index, 'unitPrice', sanitizeCurrencyInput(e.target.value));
                  }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  inputProps={{ style: { textAlign: 'right' } }}
                  sx={{ flex: 1 }}
                />

                <Box
                  sx={{
                    px: 1.5,
                    py: 0,
                    borderRadius: 1.5,
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                    minWidth: { xs: '100%', sm: 190 },
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                    Total del ítem
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={800} color="primary.main">
                    {formatCurrency(
                      (parseFloat(item.quantity) || 0) * parseCurrencyInput(item.unitPrice),
                    )}
                  </Typography>
                </Box>
              </Stack>

              <TextField
                label="Descripción"
                value={item.description}
                onChange={(e) => updateItem(index, 'description', e.target.value)}
                multiline
                rows={2}
                placeholder="Detalle adicional del gasto..."
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  label="Método de pago"
                  value={item.paymentMethod}
                  disabled={isItemLocked(index)}
                  helperText={isItemLocked(index) ? 'Ya se pagó: no se puede cambiar' : undefined}
                  onChange={(e) => {
                    const method = e.target.value as PaymentMethod;
                    updateItem(index, 'paymentMethod', method);
                    if (method !== PaymentMethod.TRANSFER) {
                      updateItem(index, 'bankEntity', null);
                    }
                  }}
                  sx={{ flex: 1 }}
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>

                {item.paymentMethod === PaymentMethod.TRANSFER && (
                  <Box sx={{ flex: 1 }}>
                    <BankSelector
                      value={item.bankEntity ?? null}
                      onChange={(val) => updateItem(index, 'bankEntity', val)}
                      disabled={isItemLocked(index)}
                    />
                  </Box>
                )}

                <Box sx={{ flex: 2, display: 'flex', gap: 1 }}>
                  <Autocomplete
                    options={suppliers.filter((s) => s.isActive !== false)}
                    getOptionLabel={(s) => s.name}
                    value={suppliers.find((s) => s.id === item.supplierId) ?? null}
                    onChange={(_, val) => {
                      updateItem(index, 'supplierId', val?.id ?? '');
                      updateItem(index, 'supplierLabel', val?.name ?? '');
                    }}
                    loading={suppliersQuery.isLoading}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Proveedor"
                        placeholder="Buscar proveedor..."
                      />
                    )}
                    sx={{ flexGrow: 1 }}
                  />
                  <Button
                    variant="outlined"
                    sx={{ minWidth: "120px" }}
                    onClick={() => {
                      setSupplierModalTargetIndex(index);
                      setSupplierModalOpen(true);
                    }}
                    startIcon={<AddIcon />}
                  >
                    Nuevo
                  </Button>
                </Box>
              </Stack>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Autocomplete
                  options={productionAreas.filter((pa) => pa.isActive !== false)}
                  getOptionLabel={(pa) => pa.name}
                  value={
                    productionAreas.find((pa) =>
                      item.productionAreaIds.includes(pa.id),
                    ) ?? null
                  }
                  onChange={(_, val) =>
                    updateItem(index, 'productionAreaIds', val ? [val.id] : [])
                  }
                  isOptionEqualToValue={(option, val) => option.id === val.id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Área de producción"
                      placeholder="Seleccionar área de producción..."
                    />
                  )}
                  sx={{ flexGrow: 1 }}
                />
                <Button
                  variant="outlined"
                  sx={{ minWidth: '120px' }}
                  onClick={() => {
                    setProductionAreaModalTargetIndex(index);
                    setProductionAreaModalOpen(true);
                  }}
                  startIcon={<AddIcon />}
                >
                  Nuevo
                </Button>
              </Box>

              {/* ── Imágenes ── */}
              <Box>
                <Divider sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                    Imágenes
                  </Typography>
                </Divider>
                <Grid container spacing={2}>
                  {/* Comprobante de pago */}
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                      Comprobante de pago
                    </Typography>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      hidden
                      ref={(el) => { fileInputRefs.current[index] = el; }}
                      onChange={(e) => handleReceiptFileChange(index, e.target.files?.[0] ?? null)}
                    />
                    {!receiptFiles[index] && !item.receiptFileId && (
                      <Stack spacing={1}>
                        <Button
                          variant="outlined"
                          startIcon={<AttachFileIcon />}
                          size="small"
                          onClick={() => fileInputRefs.current[index]?.click()}
                          sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                        >
                          Adjuntar imagen
                        </Button>
                        <Box
                          onPaste={(e) => handlePasteForItem(index, e)}
                          tabIndex={0}
                          sx={{
                            border: '2px dashed',
                            borderColor: 'grey.300',
                            borderRadius: 1,
                            p: 2,
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'border-color 0.2s, background-color 0.2s',
                            '&:hover, &:focus': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                          }}
                        >
                          <ImageIcon sx={{ fontSize: 28, color: 'grey.400', mb: 0.5 }} />
                          <Typography variant="caption" color="text.secondary" display="block">
                            O pega una imagen aquí (Ctrl+V / ⌘+V)
                          </Typography>
                        </Box>
                      </Stack>
                    )}
                    {receiptFiles[index] && (
                      <Stack spacing={1.5}>
                        <Box sx={{ width: 'fit-content', border: '1px solid', borderColor: 'grey.300', borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.50' }}>
                          <Box
                            component="img"
                            src={URL.createObjectURL(receiptFiles[index]!)}
                            alt="Vista previa comprobante"
                            sx={{ display: 'block', maxWidth: 200, maxHeight: 140, objectFit: 'contain' }}
                            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                          />
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Chip
                            icon={<ImageIcon />}
                            label={`${receiptFiles[index]!.name} (${(receiptFiles[index]!.size / 1024).toFixed(1)} KB)`}
                            color="primary"
                            variant="outlined"
                            size="small"
                            onDelete={() => clearReceiptForItem(index)}
                            deleteIcon={<CloseIcon />}
                            sx={{ maxWidth: 240 }}
                          />
                          <Typography variant="caption" color="text.secondary">Se subirá al guardar</Typography>
                        </Stack>
                      </Stack>
                    )}
                    {!receiptFiles[index] && item.receiptFileId && (
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Chip
                          icon={<ImageIcon />}
                          label="Comprobante adjunto"
                          color="success"
                          variant="outlined"
                          size="small"
                          onDelete={isItemLocked(index) ? undefined : () => clearReceiptForItem(index)}
                          deleteIcon={<CloseIcon />}
                        />
                        {!isItemLocked(index) && (
                          <Button size="small" variant="text" startIcon={<AttachFileIcon />} onClick={() => fileInputRefs.current[index]?.click()} sx={{ textTransform: 'none' }}>
                            Cambiar imagen
                          </Button>
                        )}
                      </Stack>
                    )}
                  </Grid>

                  {/* Imagen de referencia */}
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                      Imagen de referencia
                    </Typography>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      hidden
                      ref={(el) => { referenceFileInputRefs.current[index] = el; }}
                      onChange={(e) => handleReferenceFileChange(index, e.target.files?.[0] ?? null)}
                    />
                    {!referenceFiles[index] && !item.referenceFileId && (
                      <Stack spacing={1}>
                        <Button
                          variant="outlined"
                          startIcon={<AttachFileIcon />}
                          size="small"
                          onClick={() => referenceFileInputRefs.current[index]?.click()}
                          sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                        >
                          Adjuntar imagen
                        </Button>
                        <Box
                          onPaste={(e) => handlePasteReferenceForItem(index, e)}
                          tabIndex={0}
                          sx={{
                            border: '2px dashed',
                            borderColor: 'grey.300',
                            borderRadius: 1,
                            p: 2,
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'border-color 0.2s, background-color 0.2s',
                            '&:hover, &:focus': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                          }}
                        >
                          <ImageIcon sx={{ fontSize: 28, color: 'grey.400', mb: 0.5 }} />
                          <Typography variant="caption" color="text.secondary" display="block">
                            O pega una imagen aquí (Ctrl+V / ⌘+V)
                          </Typography>
                        </Box>
                      </Stack>
                    )}
                    {referenceFiles[index] && (
                      <Stack spacing={1.5}>
                        <Box sx={{ width: 'fit-content', border: '1px solid', borderColor: 'grey.300', borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.50' }}>
                          <Box
                            component="img"
                            src={URL.createObjectURL(referenceFiles[index]!)}
                            alt="Vista previa referencia"
                            sx={{ display: 'block', maxWidth: 200, maxHeight: 140, objectFit: 'contain' }}
                            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                          />
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Chip
                            icon={<ImageIcon />}
                            label={`${referenceFiles[index]!.name} (${(referenceFiles[index]!.size / 1024).toFixed(1)} KB)`}
                            color="secondary"
                            variant="outlined"
                            size="small"
                            onDelete={() => clearReferenceForItem(index)}
                            deleteIcon={<CloseIcon />}
                            sx={{ maxWidth: 240 }}
                          />
                          <Typography variant="caption" color="text.secondary">Se subirá al guardar</Typography>
                        </Stack>
                      </Stack>
                    )}
                    {!referenceFiles[index] && item.referenceFileId && (
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Chip
                          icon={<ImageIcon />}
                          label="Referencia adjunta"
                          color="secondary"
                          variant="outlined"
                          size="small"
                          onDelete={() => clearReferenceForItem(index)}
                          deleteIcon={<CloseIcon />}
                        />
                        <Button size="small" variant="text" startIcon={<AttachFileIcon />} onClick={() => referenceFileInputRefs.current[index]?.click()} sx={{ textTransform: 'none' }}>
                          Cambiar imagen
                        </Button>
                      </Stack>
                    )}
                  </Grid>
                </Grid>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );

  const renderStep4 = () => (
    <Stack spacing={3}>
      <Typography variant="h6" fontWeight={600}>
        Resumen de la Orden de Gasto
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between">
              <Typography color="text.secondary">Tipo de gasto:</Typography>
              <Typography fontWeight={500}>
                {selectedType?.name} / {subcategories.find((s) => s.id === expenseSubcategoryId)?.name}
              </Typography>
            </Stack>

            {workOrderId && (
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">OT asociada:</Typography>
                <Typography fontWeight={500}>
                  {selectedWorkOrder?.workOrderNumber ?? workOrderId}
                </Typography>
              </Stack>
            )}

            <Stack direction="row" justifyContent="space-between">
              <Typography color="text.secondary">Se autoriza a:</Typography>
              <Typography fontWeight={500}>
                {(() => {
                  const u = users.find((u) => u.id === authorizedToId);
                  return u
                    ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email
                    : '—';
                })()}
              </Typography>
            </Stack>

            <Divider />

            <Stack direction="row" justifyContent="space-between">
              <Typography color="text.secondary">Número de ítems:</Typography>
              <Typography fontWeight={500}>{items.length}</Typography>
            </Stack>

            <Stack direction="row" justifyContent="space-between">
              <Typography color="text.secondary">Subtotal:</Typography>
              <Typography fontWeight={500}>{formatCurrency(totalAmount)}</Typography>
            </Stack>

            <Divider />

            {/* IVA opcional */}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={applyIva}
                    onChange={(e) => setApplyIva(e.target.checked)}
                  />
                }
                label="Aplicar IVA"
              />
              {applyIva && (
                <TextField
                  size="small"
                  type="number"
                  label="Porcentaje IVA"
                  value={ivaPercentage}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setIvaPercentage(
                      Number.isNaN(v) ? 0 : Math.min(100, Math.max(0, v)),
                    );
                  }}
                  sx={{ width: 150 }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                  inputProps={{ min: 0, max: 100, step: 1 }}
                />
              )}
            </Stack>

            {applyIva && (
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">IVA ({ivaPercentage}%):</Typography>
                <Typography fontWeight={500}>{formatCurrency(ivaAmount)}</Typography>
              </Stack>
            )}

            <Divider />

            {/* Retenciones */}
            <WithholdingsFields
              value={withholdings}
              onChange={setWithholdings}
              applyIva={applyIva}
              error={withholdingsError}
            />

            {totals.retefuenteAmount > 0 && (
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">
                  Retefuente ({withholdingPercentages.retefuente}%):
                </Typography>
                <Typography fontWeight={500} color="error.main">
                  - {formatCurrency(totals.retefuenteAmount)}
                </Typography>
              </Stack>
            )}

            {totals.reteICAAmount > 0 && (
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">
                  ReteICA ({withholdingPercentages.reteICA}%):
                </Typography>
                <Typography fontWeight={500} color="error.main">
                  - {formatCurrency(totals.reteICAAmount)}
                </Typography>
              </Stack>
            )}

            {totals.reteIVAAmount > 0 && (
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">
                  ReteIVA ({withholdingPercentages.reteIVA}%):
                </Typography>
                <Typography fontWeight={500} color="error.main">
                  - {formatCurrency(totals.reteIVAAmount)}
                </Typography>
              </Stack>
            )}

            {hasWithholdings && <Divider />}

            <Stack direction="row" justifyContent="space-between">
              <Typography variant="subtitle1" fontWeight={700}>
                {hasWithholdings
                  ? 'Total a pagar:'
                  : applyIva
                    ? 'Total con IVA:'
                    : 'Total estimado:'}
              </Typography>
              <Typography variant="subtitle1" fontWeight={700} color="primary">
                {formatCurrency(grandTotal)}
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {!isStep1Valid && (
        <Alert severity="warning">Completa el paso 1: tipo y subcategoría de gasto.</Alert>
      )}
      {!isStep2Valid && (
        <Alert severity="warning">Completa el paso 2: usuario autorizado.</Alert>
      )}
      {!isStep3Valid && (
        <Alert severity="warning">
          Completa el paso 3: todos los ítems deben tener nombre, cantidad y precio unitario.
        </Alert>
      )}

      {withholdingsError && <Alert severity="warning">{withholdingsError}.</Alert>}
      {isStep1Valid && isStep2Valid && isStep3Valid && !withholdingsError && (
        <Alert severity="success">Todos los datos están listos para guardar.</Alert>
      )}
    </Stack>
  );

  const canSubmit = isStep1Valid && isStep2Valid && isStep3Valid && !withholdingsError;

  // ─── Step navigation ──────────────────────────────────────────────────────────
  const goToStep = (step: number) => {
    setActiveStep(step);
    setVisitedSteps((prev) => new Set([...prev, step]));
  };

  const getStepStatus = (i: number): 'active' | 'completed' | 'visited' | 'pending' => {
    if (i === activeStep) return 'active';
    if (!visitedSteps.has(i)) return 'pending';
    const validByStep = [isStep1Valid, isStep2Valid, isStep3Valid, canSubmit];
    return validByStep[i] ? 'completed' : 'visited';
  };

  return (
    <Box>
      <PageHeader
        title={isEditing ? `Editar OG` : 'Nueva Orden de Gasto'}
        subtitle={isEditing ? existingOG?.ogNumber : 'Registro de gasto empresarial'}
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

      {isEditing && paidEdit.isPaid && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <strong>Estás corrigiendo una OG que ya fue pagada.</strong> Si el total sube, la
          diferencia queda pendiente en su cuenta por pagar y Caja la paga desde ahí; el total no
          puede quedar por debajo de lo ya pagado. Los ítems pagados no se pueden quitar ni
          cambiar de método de pago, banco o comprobante.
          {!paidEdit.isAdmin && ' La autorización sirve para una sola edición.'}
        </Alert>
      )}

      <Box sx={{ maxWidth: '100%' }}>
        {/* Content */}
        <Box flex={1}>
          {activeStep === 0 && renderStep1()}
          {activeStep === 1 && renderStep2()}
          {activeStep === 2 && renderStep3()}
          {activeStep === 3 && renderStep4()}

          {/* Navigation */}
          <Stack
            direction={{ xs: 'column-reverse', sm: 'row' }}
            justifyContent="space-between"
            spacing={{ xs: 1, sm: 0 }}
            sx={{ mt: 4 }}
          >
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() =>
                activeStep === 0
                  ? navigate(-1)
                  : goToStep(activeStep - 1)
              }
              disabled={isSubmitting}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              {activeStep === 0 ? 'Cancelar' : 'Anterior'}
            </Button>

            {activeStep < STEPS.length - 1 ? (
              <Button
                variant="contained"
                onClick={() => goToStep(activeStep + 1)}
                disabled={
                  (activeStep === 0 && !isStep1Valid) ||
                  (activeStep === 1 && !isStep2Valid) ||
                  (activeStep === 2 && !isStep3Valid)
                }
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                Siguiente
              </Button>
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                {/* Una OG pagada no vuelve a borrador: guardar es la corrección. */}
                {!paidEdit.isPaid && (
                  <Button
                    variant="outlined"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveDraft}
                    disabled={isSubmitting || !canSubmit}
                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                  >
                    Guardar Borrador
                  </Button>
                )}
                <Button
                  variant="contained"
                  startIcon={<CheckCircleIcon />}
                  onClick={handleCreate}
                  disabled={isSubmitting || !canSubmit}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  {isSubmitting ? <CircularProgress size={20} /> : isEditing ? 'Guardar cambios' : 'Crear OG'}
                </Button>
              </Stack>
            )}
          </Stack>
        </Box>
      </Box>

      {/* ── Create Supplier modal ────────────────────────────────────────────── */}
      <CreateSupplierModal
        open={supplierModalOpen}
        onClose={() => {
          setSupplierModalOpen(false);
          setSupplierModalTargetIndex(null);
        }}
        onSuccess={handleCreateSupplierSuccess}
      />

      {/* ── Create Production Area modal ─────────────────────────────────────── */}
      <CreateProductionAreaModal
        open={productionAreaModalOpen}
        onClose={() => {
          setProductionAreaModalOpen(false);
          setProductionAreaModalTargetIndex(null);
        }}
        onSuccess={handleCreateProductionAreaSuccess}
      />

      {/* ── Post-creation informational dialog ───────────────────────────────── */}
      <Dialog
        open={!!createdOg}
        onClose={handleCreatedDialogClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
          },
        }}
      >
        {/* Header con fondo de color */}
        <Box
          sx={{
            background: (t) =>
              `linear-gradient(135deg, ${t.palette.success.dark} 0%, ${t.palette.success.main} 100%)`,
            px: 3,
            pt: 3,
            pb: 2.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            <TaskAltIcon sx={{ color: '#fff', fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} color="#fff" lineHeight={1.2}>
              ¡Orden de Gasto creada exitosamente!
            </Typography>
            <Chip
              label={createdOg?.ogNumber ?? ''}
              size="small"
              sx={{
                mt: 0.75,
                bgcolor: 'rgba(255,255,255,0.25)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.8rem',
                letterSpacing: 0.5,
              }}
            />
          </Box>
        </Box>

        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          {/* Explicación del estado inicial */}
          <Alert
            severity="info"
            icon={false}
            sx={{
              mb: 2.5,
              borderRadius: 2,
              bgcolor: (t) => alpha(t.palette.info.main, 0.08),
              border: (t) => `1px solid ${alpha(t.palette.info.main, 0.2)}`,
            }}
          >
            <Typography variant="body2" fontWeight={600} color="info.dark" sx={{ mb: 0.5 }}>
              Estado inicial: <strong>Creada</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary" lineHeight={1.6}>
              La OG ha sido registrada en el sistema. Para que el pago se efectúe,
              debe pasar por <strong>dos aprobaciones obligatorias</strong> en el siguiente orden:
            </Typography>
          </Alert>

          {/* Flujo visual de aprobaciones */}
          <Stack spacing={0}>
            {/* Paso 1: Gerencia */}
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  bgcolor: (t) => alpha(t.palette.warning.main, 0.12),
                  border: (t) => `2px solid ${t.palette.warning.main}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ManageAccountsIcon sx={{ color: 'warning.dark', fontSize: 20 }} />
              </Box>
              <Box flex={1}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                  <Typography variant="caption" fontWeight={700} color="warning.dark"
                    sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    1ª Firma — Gerencia / Admin
                  </Typography>
                  <Chip label="Autorizada (Admin)" size="small" color="warning" variant="outlined"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                </Stack>
                <Typography variant="body2" color="text.secondary" lineHeight={1.55}>
                  Un administrador revisa que el gasto sea pertinente y lo aprueba.
                  La OG cambia a estado <strong>"Autorizada (Admin)"</strong> pero
                  <strong> el dinero aún no se desembolsa.</strong>
                </Typography>
              </Box>
            </Box>

            {/* Conector */}
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
                <EastRoundedIcon sx={{ transform: 'rotate(90deg)', color: 'text.disabled', fontSize: 20 }} />
              </Box>
            </Box>

            {/* Paso 2: Caja */}
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  bgcolor: (t) => alpha(t.palette.success.main, 0.12),
                  border: (t) => `2px solid ${t.palette.success.main}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AccountBalanceIcon sx={{ color: 'success.dark', fontSize: 20 }} />
              </Box>
              <Box flex={1}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                  <Typography variant="caption" fontWeight={700} color="success.dark"
                    sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    2ª Firma — Caja
                  </Typography>
                  <Chip label="Pagada automáticamente" size="small" color="success" variant="outlined"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                </Stack>
                <Typography variant="body2" color="text.secondary" lineHeight={1.55}>
                  Caja realiza la aprobación financiera, registra el movimiento de efectivo
                  y la OG pasa <strong>automáticamente a estado "Pagada".</strong>
                </Typography>
              </Box>
            </Box>
          </Stack>

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
            Puedes consultar el estado de la OG en cualquier momento desde el detalle.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1 }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<OpenInNewIcon />}
            onClick={handleCreatedDialogClose}
            fullWidth
            sx={{ borderRadius: 2, py: 1.25, fontWeight: 700 }}
          >
            Entendido — Ver Orden de Gasto
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExpenseOrderFormPage;
