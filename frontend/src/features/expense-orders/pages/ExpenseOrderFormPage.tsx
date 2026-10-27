import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Tooltip,
  type Theme,
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
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
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
import { useTimeMachines, useWorkOrder } from '../../work-orders/hooks';
import type { WorkOrder, WorkOrderItem } from '../../../types/work-order.types';
import { getAliveQuantity } from '../../orders/utils/partialAnnulment';
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
  /** Ítem de la OT al que pertenece la línea. `null` = toda la OT. */
  workOrderItemId: string | null;
}

/** Tope del «Nombre del gasto» (el backend valida lo mismo). */
const EXPENSE_NAME_MAX = 200;

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
  workOrderItemId: null,
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
  // Ítems de la OT a los que aplica el gasto. Vacío = toda la OT.
  const [workOrderItemIds, setWorkOrderItemIds] = useState<string[]>([]);

  // ─── Step 2: Authorization ──────────────────────────────────────────────────
  const [authorizedToId, setAuthorizedToId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [observations, setObservations] = useState('');
  const [areaOrMachine, setAreaOrMachine] = useState('');
  const [machineId, setMachineId] = useState('');

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
  // Un ítem anulado por completo en la OP no se produce: no se ofrece (salvo
  // que una OG vieja ya lo tenga).
  const workOrderItemOptions = (selectedWorkOrder?.items ?? []).filter(
    (woi) => getAliveQuantity(woi.orderItem) > 0 || workOrderItemIds.includes(woi.id),
  );
  const selectedWorkOrderItemsLabel = workOrderItemOptions
    .filter((woi) => workOrderItemIds.includes(woi.id))
    .map((woi) => woi.productDescription)
    .join(' · ');
  const { usersQuery } = useUsers();
  const users = usersQuery.data ?? [];
  const { productionAreasQuery } = useProductionAreas();
  const productionAreas = productionAreasQuery.data ?? [];
  const { suppliersQuery } = useSuppliers();
  const suppliers = suppliersQuery.data ?? [];
  // Máquinas activas del área elegida y, debajo, las que no tienen área
  // asignada (en PRD casi todas, 2026-10). El área se guarda por nombre.
  const { data: machines, isLoading: loadingMachines } = useTimeMachines();
  const areaMachines = useMemo(() => {
    if (!areaOrMachine) return [];
    const all = machines ?? [];
    return [
      ...all.filter((m) => m.productionArea?.name === areaOrMachine),
      ...all.filter((m) => !m.productionArea),
    ];
  }, [areaOrMachine, machines]);

  // Al cambiar el área, la máquina elegida deja de valer si es de otra área.
  // Una máquina que ya no está activa (OG vieja) no aparece en la lista y se
  // conserva tal cual.
  useEffect(() => {
    if (!machineId || !machines) return;
    const machine = machines.find((m) => m.id === machineId);
    const otherArea = !!machine?.productionArea && machine.productionArea.name !== areaOrMachine;
    if (otherArea || (machine && !areaOrMachine)) setMachineId('');
  }, [areaOrMachine, machineId, machines]);

  // ─── Área sugerida desde los ítems de la OT (solo al crear) ─────────────────
  // La primera área activa del primer ítem marcado. Llena «Área encargada» y
  // el área de las líneas de toda la OT mientras el usuario no las haya
  // cambiado a mano; si cambia la selección de ítems, la sugerencia se mueve.
  // Las líneas de un ítem toman el área de su propio ítem al nacer.
  const activeAreaIds = useMemo(
    () =>
      new Set(
        (productionAreasQuery.data ?? [])
          .filter((pa) => pa.isActive !== false)
          .map((pa) => pa.id),
      ),
    [productionAreasQuery.data],
  );
  const firstActiveArea = useCallback(
    (woi: WorkOrderItem | undefined) =>
      woi?.productionAreas.find((pa) => activeAreaIds.has(pa.productionArea.id))?.productionArea ??
      null,
    [activeAreaIds],
  );
  const suggestedArea = useMemo(() => {
    for (const itemId of workOrderItemIds) {
      const match = firstActiveArea(selectedWorkOrder?.items.find((i) => i.id === itemId));
      if (match) return match;
    }
    return null;
  }, [firstActiveArea, selectedWorkOrder, workOrderItemIds]);
  const lastSuggestedAreaRef = useRef<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (isEditing) return;
    const prev = lastSuggestedAreaRef.current;
    if (prev?.id === suggestedArea?.id) return;
    lastSuggestedAreaRef.current = suggestedArea;

    const next = suggestedArea;
    setAreaOrMachine((current) =>
      !current || current === prev?.name ? next?.name ?? '' : current,
    );
    setItems((current) =>
      current.map((item) => {
        const untouched =
          !item.workOrderItemId &&
          (item.productionAreaIds.length === 0 ||
            (item.productionAreaIds.length === 1 && item.productionAreaIds[0] === prev?.id));
        return untouched ? { ...item, productionAreaIds: next ? [next.id] : [] } : item;
      }),
    );
  }, [isEditing, suggestedArea]);

  /**
   * Línea de gasto para un ítem de la OT: su nombre y su cantidad viva (sin lo
   * anulado en la OP). Si la descripción no cabe en el nombre, va completa en
   * «Descripción».
   */
  const buildLineForWorkOrderItem = useCallback(
    (woi: WorkOrderItem): ExpenseItemForm => {
      const description = woi.productDescription.trim();
      const tooLong = description.length > EXPENSE_NAME_MAX;
      const area = firstActiveArea(woi);
      return {
        ...defaultItem(),
        name: tooLong ? description.slice(0, EXPENSE_NAME_MAX) : description,
        description: tooLong ? description : '',
        quantity: String(getAliveQuantity(woi.orderItem) || 1),
        productionAreaIds: area ? [area.id] : [],
        workOrderItemId: woi.id,
      };
    },
    [firstActiveArea],
  );

  // Ítems a marcar cuando lleguen la OT y el catálogo de áreas: al elegir una
  // OT al crear se marcan todos ('all'); el botón «Gasto» de un ítem de la OT
  // manda solo ese ítem en la URL.
  const pendingPrefillItemIdsRef = useRef<string[] | 'all' | null>(null);
  useEffect(() => {
    const pending = pendingPrefillItemIdsRef.current;
    if (
      !pending ||
      !selectedWorkOrder ||
      selectedWorkOrder.id !== workOrderId ||
      !productionAreasQuery.data
    ) {
      return;
    }
    pendingPrefillItemIdsRef.current = null;
    const source =
      pending === 'all'
        ? selectedWorkOrder.items.filter((woi) => getAliveQuantity(woi.orderItem) > 0)
        : pending
            .map((itemId) => selectedWorkOrder.items.find((i) => i.id === itemId))
            .filter((woi): woi is WorkOrderItem => !!woi);
    const lines = source.map(buildLineForWorkOrderItem);
    if (!lines.length) return;

    // Las líneas que ya tienen algo escrito se conservan; la línea en blanco
    // con la que arranca el formulario se reemplaza.
    const keep = items
      .map((_, i) => i)
      .filter((i) => {
        const item = items[i];
        return (
          !!item.workOrderItemId ||
          !!item.name.trim() ||
          !!item.description.trim() ||
          !!item.unitPrice ||
          !!item.supplierId ||
          !!item.receiptFileId ||
          !!item.referenceFileId ||
          !!receiptFiles[i] ||
          !!referenceFiles[i]
        );
      });
    setWorkOrderItemIds(lines.map((line) => line.workOrderItemId!));
    setItems([...keep.map((i) => items[i]), ...lines]);
    setReceiptFiles([...keep.map((i) => receiptFiles[i] ?? null), ...lines.map(() => null)]);
    setReferenceFiles([...keep.map((i) => referenceFiles[i] ?? null), ...lines.map(() => null)]);
  }, [
    buildLineForWorkOrderItem,
    items,
    productionAreasQuery.data,
    receiptFiles,
    referenceFiles,
    selectedWorkOrder,
    workOrderId,
  ]);

  // ─── Edit: load existing OG ──────────────────────────────────────────────────
  const { expenseOrderQuery } = useExpenseOrder(id);
  const existingOG = expenseOrderQuery.data;

  // Una OG pagada se corrige con autorización del admin. Sus ítems ya salieron
  // de caja: no se quitan ni se les cambia el comprobante (el backend lo vuelve
  // a validar). Se pueden agregar ítems y corregir montos. El método de pago y
  // el banco se pueden corregir mientras la caja de donde salieron siga abierta.
  const paidEdit = usePaidExpenseOrderEdit(isEditing ? existingOG : undefined);
  const lockedItemCount = isEditing && paidEdit.isPaid ? existingOG?.items.length ?? 0 : 0;
  const isItemLocked = (index: number) => index < lockedItemCount;
  const correctableItemCount = lockedItemCount > 0 ? existingOG?.paymentCorrectableItems ?? 0 : 0;
  const isPaymentLocked = (index: number) =>
    isItemLocked(index) && index >= correctableItemCount;
  const isPaymentCorrectable = (index: number) =>
    isItemLocked(index) && index < correctableItemCount;

  useEffect(() => {
    if (existingOG) {
      setExpenseTypeId(existingOG.expenseType.id);
      setExpenseSubcategoryId(existingOG.expenseSubcategory.id);
      setWorkOrderId(existingOG.workOrder?.id ?? '');
      setWorkOrderItemIds(existingOG.workOrderItems?.map((woi) => woi.workOrderItem.id) ?? []);
      setAuthorizedToId(existingOG.authorizedTo?.id ?? '');
      setResponsibleId(existingOG.responsible?.id ?? '');
      setObservations(existingOG.observations ?? '');
      setAreaOrMachine(existingOG.areaOrMachine ?? '');
      setMachineId(existingOG.machine?.id ?? '');
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
            workOrderItemId: item.workOrderItemId ?? null,
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
    // El botón «Gasto» de un ítem de la OT lo manda ya marcado.
    // Sin ítems en la URL (botón general de la OT) se marcan todos.
    const prefillItemIds = queryParams.get('workOrderItemIds')?.split(',').filter(Boolean);
    pendingPrefillItemIdsRef.current = prefillItemIds?.length ? prefillItemIds : 'all';
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
    const suggested = lastSuggestedAreaRef.current;
    setItems((prev) => [
      ...prev,
      { ...defaultItem(), productionAreaIds: suggested ? [suggested.id] : [] },
    ]);
    setReceiptFiles((prev) => [...prev, null]);
    setReferenceFiles((prev) => [...prev, null]);
  };

  const removeItem = (index: number) => {
    // Un ítem de la OT sin líneas deja de estar marcado: «un formulario por ítem».
    const removedItemId = items[index]?.workOrderItemId;
    if (
      removedItemId &&
      !items.some((item, i) => i !== index && item.workOrderItemId === removedItemId)
    ) {
      setWorkOrderItemIds((prev) => prev.filter((itemId) => itemId !== removedItemId));
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
    setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
    setReferenceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Ítems de la OT → líneas de gasto ────────────────────────────────────────
  // Marcar un ítem crea su línea; desmarcarlo quita sus líneas. Si alguna ya
  // tiene datos (precio, proveedor, imágenes) se pide confirmación antes.
  const [pendingWorkOrderItemIds, setPendingWorkOrderItemIds] = useState<string[] | null>(null);

  const lineHasData = (index: number) => {
    const item = items[index];
    return (
      !!item.unitPrice ||
      !!item.supplierId ||
      !!item.receiptFileId ||
      !!item.referenceFileId ||
      !!receiptFiles[index] ||
      !!referenceFiles[index]
    );
  };

  const isBlankLine = (index: number) =>
    !items[index].workOrderItemId &&
    !items[index].name.trim() &&
    !items[index].description.trim() &&
    !lineHasData(index);

  const commitWorkOrderItemSelection = (nextIds: string[]) => {
    const removed = new Set(workOrderItemIds.filter((itemId) => !nextIds.includes(itemId)));
    const added = nextIds.filter((itemId) => !workOrderItemIds.includes(itemId));

    let keep = items.map((_, i) => i).filter((i) => !removed.has(items[i].workOrderItemId ?? ''));
    const addedLines = added
      .map((itemId) => workOrderItemOptions.find((woi) => woi.id === itemId))
      .filter((woi): woi is WorkOrderItem => !!woi)
      .map(buildLineForWorkOrderItem);
    // La línea en blanco con la que arranca el formulario se reemplaza.
    if (addedLines.length && keep.length === 1 && isBlankLine(keep[0])) keep = [];

    const nextItems = [...keep.map((i) => items[i]), ...addedLines];
    const nextReceipts = [...keep.map((i) => receiptFiles[i] ?? null), ...addedLines.map(() => null)];
    const nextReferences = [...keep.map((i) => referenceFiles[i] ?? null), ...addedLines.map(() => null)];
    if (!nextItems.length) {
      const suggested = lastSuggestedAreaRef.current;
      nextItems.push({ ...defaultItem(), productionAreaIds: suggested ? [suggested.id] : [] });
      nextReceipts.push(null);
      nextReferences.push(null);
    }
    setWorkOrderItemIds(nextIds);
    setItems(nextItems);
    setReceiptFiles(nextReceipts);
    setReferenceFiles(nextReferences);
  };

  const changeWorkOrderItemSelection = (nextIds: string[]) => {
    const removedLines = items
      .map((item, i) => (item.workOrderItemId && !nextIds.includes(item.workOrderItemId) ? i : -1))
      .filter((i) => i >= 0);
    if (removedLines.some(isItemLocked)) {
      enqueueSnackbar('Ese ítem tiene una línea ya pagada: no se puede quitar', { variant: 'warning' });
      return;
    }
    if (removedLines.some(lineHasData)) {
      setPendingWorkOrderItemIds(nextIds);
      return;
    }
    commitWorkOrderItemSelection(nextIds);
  };

  // Cambiar la OT suelta las líneas de sus ítems (los ítems son de la OT). Las
  // que se armaron solas y nadie tocó se van; las que tienen datos quedan como
  // gasto de toda la OT.
  const detachLinesFromWorkOrder = () => {
    const keep = items.map((_, i) => i).filter((i) => !items[i].workOrderItemId || lineHasData(i));
    const nextItems: ExpenseItemForm[] = keep.map((i) => ({ ...items[i], workOrderItemId: null }));
    const nextReceipts = keep.map((i) => receiptFiles[i] ?? null);
    const nextReferences = keep.map((i) => referenceFiles[i] ?? null);
    if (!nextItems.length) {
      nextItems.push(defaultItem());
      nextReceipts.push(null);
      nextReferences.push(null);
    }
    setWorkOrderItemIds([]);
    setItems(nextItems);
    setReceiptFiles(nextReceipts);
    setReferenceFiles(nextReferences);
  };

  /** Cambia el ítem de la OT de una línea; su área sigue al ítem si no se tocó. */
  const changeLineWorkOrderItem = (index: number, nextItemId: string | null) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const prevArea = firstActiveArea(workOrderItemOptions.find((w) => w.id === item.workOrderItemId));
        const nextArea = nextItemId
          ? firstActiveArea(workOrderItemOptions.find((w) => w.id === nextItemId))
          : lastSuggestedAreaRef.current;
        const areaUntouched =
          item.productionAreaIds.length === 0 ||
          (item.productionAreaIds.length === 1 && item.productionAreaIds[0] === prevArea?.id);
        return {
          ...item,
          workOrderItemId: nextItemId,
          productionAreaIds: areaUntouched ? (nextArea ? [nextArea.id] : []) : item.productionAreaIds,
        };
      }),
    );
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
    workOrderItemIds: workOrderId ? workOrderItemIds : undefined,
    authorizedToId: authorizedToId || undefined,
    responsibleId: responsibleId || undefined,
    observations: observations || undefined,
    areaOrMachine: areaOrMachine || undefined,
    machineId: machineId || null,
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
      workOrderItemId: workOrderId ? item.workOrderItemId : null,
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
            detachLinesFromWorkOrder();
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
            detachLinesFromWorkOrder();
            // Al crear, la OT nueva llega con todos sus ítems marcados.
            pendingPrefillItemIdsRef.current = wo && !isEditing ? 'all' : null;
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
            label="Área encargada"
            placeholder="Seleccionar área de producción..."
          />
        )}
      />

      <Autocomplete
        options={areaMachines}
        groupBy={(m) => (m.productionArea ? m.productionArea.name : 'Sin área asignada')}
        getOptionLabel={(m) => m.name}
        value={areaMachines.find((m) => m.id === machineId) ?? null}
        onChange={(_, val) => setMachineId(val?.id ?? '')}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        disabled={!areaOrMachine}
        loading={loadingMachines}
        noOptionsText="Esta área no tiene máquinas"
        renderInput={(params) => (
          <TextField
            {...params}
            label="Máquina (opcional)"
            placeholder={areaOrMachine ? 'Seleccionar máquina...' : ''}
            helperText={!areaOrMachine ? 'Elige primero el área encargada' : undefined}
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

  // Botón «+» junto a un select pequeño: misma altura que el campo (40 px).
  const addButtonSx = {
    width: 40,
    height: 40,
    flexShrink: 0,
    border: 1,
    borderRadius: 1,
    borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.5),
  };

  /**
   * Una imagen de la línea de gasto en poco espacio: botón para adjuntar y
   * zona para pegar en la misma fila; al elegir un archivo, miniatura y chip.
   */
  const renderImageField = ({
    label,
    file,
    attachedLabel,
    attachedColor,
    locked,
    onPick,
    onPaste,
    onClear,
  }: {
    label: string;
    file: File | null | undefined;
    attachedLabel: string | null;
    attachedColor: 'success' | 'secondary';
    locked: boolean;
    onPick: () => void;
    onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
    onClear: () => void;
  }) => (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 500 }}>
        {label}
      </Typography>
      {!file && !attachedLabel && (
        <Stack direction="row" spacing={1} alignItems="stretch">
          <Button
            variant="outlined"
            startIcon={<AttachFileIcon />}
            size="small"
            onClick={onPick}
            sx={{
              textTransform: 'none',
              flexShrink: 0,
              height: 36,
              minHeight: 0,
              px: 1.5,
              py: 0,
              borderWidth: 1,
              '&:hover': { borderWidth: 1 },
            }}
          >
            Adjuntar
          </Button>
          <Box
            onPaste={onPaste}
            tabIndex={0}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              px: 1,
              border: '1px dashed',
              borderColor: (t) => alpha(t.palette.text.primary, 0.25),
              borderRadius: 1,
              cursor: 'pointer',
              transition: 'border-color 0.2s, background-color 0.2s',
              '&:hover, &:focus': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            <ImageIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
            <Typography variant="caption" color="text.secondary" noWrap>
              o pega aquí (Ctrl+V / ⌘+V)
            </Typography>
          </Box>
        </Stack>
      )}
      {file && (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            component="img"
            src={URL.createObjectURL(file)}
            alt={`Vista previa: ${label}`}
            sx={{ display: 'block', width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider', flexShrink: 0 }}
            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
          />
          <Box sx={{ minWidth: 0 }}>
            <Chip
              icon={<ImageIcon />}
              label={`${file.name} (${(file.size / 1024).toFixed(1)} KB)`}
              color="primary"
              variant="outlined"
              size="small"
              onDelete={onClear}
              deleteIcon={<CloseIcon />}
              sx={{ maxWidth: '100%' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Se subirá al guardar
            </Typography>
          </Box>
        </Stack>
      )}
      {!file && attachedLabel && (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip
            icon={<ImageIcon />}
            label={attachedLabel}
            color={attachedColor}
            variant="outlined"
            size="small"
            onDelete={locked ? undefined : onClear}
            deleteIcon={<CloseIcon />}
          />
          {!locked && (
            <Button size="small" variant="text" startIcon={<AttachFileIcon />} onClick={onPick} sx={{ textTransform: 'none' }}>
              Cambiar
            </Button>
          )}
        </Stack>
      )}
    </Box>
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

      {workOrderId && (
        <Autocomplete
          multiple
          options={workOrderItemOptions}
          getOptionLabel={(woi) => woi.productDescription}
          value={workOrderItemOptions.filter((woi) => workOrderItemIds.includes(woi.id))}
          onChange={(_, val) => changeWorkOrderItemSelection(val.map((woi) => woi.id))}
          isOptionEqualToValue={(option, val) => option.id === val.id}
          loading={resolvingWorkOrder}
          disableCloseOnSelect
          noOptionsText="La OT no tiene ítems para producir"
          renderInput={(params) => (
            <TextField
              {...params}
              label={`Ítems de la OT ${selectedWorkOrder?.workOrderNumber ?? ''}`.trim()}
              placeholder={workOrderItemIds.length ? '' : 'Toda la OT'}
              helperText="Cada ítem que marques crea su formulario de gasto con el nombre y la cantidad. Déjalo vacío si el gasto es de toda la OT"
            />
          )}
        />
      )}

      {items.map((item, index) => {
        const showLineWorkOrderItem = !!workOrderId && workOrderItemIds.length > 0;
        const isTransfer = item.paymentMethod === PaymentMethod.TRANSFER;
        return (
        <Card key={index} variant="outlined">
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Ítem {index + 1}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    label={formatCurrency(
                      (parseFloat(item.quantity) || 0) * parseCurrencyInput(item.unitPrice),
                    )}
                    sx={{ fontWeight: 700 }}
                  />
                  {items.length > 1 && !isItemLocked(index) && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeItem(index)}
                      aria-label={`Quitar ítem ${index + 1}`}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              </Stack>

              <Grid container spacing={1.5}>
                {showLineWorkOrderItem && (
                  <Grid item xs={12} md={5}>
                    <Autocomplete
                      size="small"
                      options={workOrderItemOptions.filter((woi) => workOrderItemIds.includes(woi.id))}
                      getOptionLabel={(woi) => woi.productDescription}
                      value={workOrderItemOptions.find((woi) => woi.id === item.workOrderItemId) ?? null}
                      onChange={(_, val) => changeLineWorkOrderItem(index, val?.id ?? null)}
                      isOptionEqualToValue={(option, val) => option.id === val.id}
                      disabled={isItemLocked(index)}
                      renderInput={(params) => (
                        <TextField {...params} label="Ítem de la OT" placeholder="Toda la OT" />
                      )}
                    />
                  </Grid>
                )}

                <Grid item xs={12} md={showLineWorkOrderItem ? 7 : 12}>
                  <TextField
                    size="small"
                    label="Nombre del gasto *"
                    value={item.name}
                    onChange={(e) => updateItem(index, 'name', e.target.value)}
                    inputProps={{ maxLength: EXPENSE_NAME_MAX }}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={4} md={2}>
                  <TextField
                    size="small"
                    label="Cantidad *"
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    inputProps={{ min: 0.01, step: 0.01 }}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={8} md={3}>
                  <TextField
                    size="small"
                    label="Precio unitario *"
                    value={item.unitPrice ? formatCurrencyInput(item.unitPrice) : ''}
                    onChange={(e) => {
                      updateItem(index, 'unitPrice', sanitizeCurrencyInput(e.target.value));
                    }}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                    inputProps={{ style: { textAlign: 'right' } }}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={isTransfer ? 6 : 12} md={isTransfer ? 3 : 7}>
                  <TextField
                    size="small"
                    select
                    label="Método de pago"
                    value={item.paymentMethod}
                    disabled={isPaymentLocked(index)}
                    helperText={
                      isPaymentLocked(index)
                        ? 'Ya se pagó y la caja se cerró: no se puede cambiar'
                        : isPaymentCorrectable(index)
                          ? 'Caja abierta: corrige también el egreso'
                          : undefined
                    }
                    onChange={(e) => {
                      const method = e.target.value as PaymentMethod;
                      updateItem(index, 'paymentMethod', method);
                      if (method !== PaymentMethod.TRANSFER) {
                        updateItem(index, 'bankEntity', null);
                      }
                    }}
                    fullWidth
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS)
                      // Un ítem pagado no pasa a crédito: el dinero ya salió.
                      .filter(
                        ([value]) =>
                          !isItemLocked(index) ||
                          value !== PaymentMethod.CREDIT ||
                          value === item.paymentMethod,
                      )
                      .map(([value, label]) => (
                        <MenuItem key={value} value={value}>
                          {label}
                        </MenuItem>
                      ))}
                  </TextField>
                </Grid>

                {isTransfer && (
                  <Grid item xs={6} md={4}>
                    <BankSelector
                      value={item.bankEntity ?? null}
                      onChange={(val) => updateItem(index, 'bankEntity', val)}
                      disabled={isPaymentLocked(index)}
                    />
                  </Grid>
                )}

                <Grid item xs={12} md={6}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Autocomplete
                      size="small"
                      options={suppliers.filter((s) => s.isActive !== false)}
                      getOptionLabel={(s) => s.name}
                      value={suppliers.find((s) => s.id === item.supplierId) ?? null}
                      onChange={(_, val) => {
                        updateItem(index, 'supplierId', val?.id ?? '');
                        updateItem(index, 'supplierLabel', val?.name ?? '');
                      }}
                      loading={suppliersQuery.isLoading}
                      renderInput={(params) => (
                        <TextField {...params} label="Proveedor" placeholder="Buscar proveedor..." />
                      )}
                      sx={{ flexGrow: 1 }}
                    />
                    <Tooltip title="Nuevo proveedor">
                      <IconButton
                        color="primary"
                        onClick={() => {
                          setSupplierModalTargetIndex(index);
                          setSupplierModalOpen(true);
                        }}
                        aria-label="Nuevo proveedor"
                        sx={addButtonSx}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Autocomplete
                      size="small"
                      options={productionAreas.filter((pa) => pa.isActive !== false)}
                      getOptionLabel={(pa) => pa.name}
                      value={
                        productionAreas.find((pa) => item.productionAreaIds.includes(pa.id)) ?? null
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
                    <Tooltip title="Nueva área de producción">
                      <IconButton
                        color="primary"
                        onClick={() => {
                          setProductionAreaModalTargetIndex(index);
                          setProductionAreaModalOpen(true);
                        }}
                        aria-label="Nueva área de producción"
                        sx={addButtonSx}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    size="small"
                    label="Descripción"
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    multiline
                    minRows={1}
                    maxRows={4}
                    placeholder="Detalle adicional del gasto..."
                    fullWidth
                  />
                </Grid>
              </Grid>

              {/* ── Imágenes ── */}
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    hidden
                    ref={(el) => { fileInputRefs.current[index] = el; }}
                    onChange={(e) => handleReceiptFileChange(index, e.target.files?.[0] ?? null)}
                  />
                  {renderImageField({
                    label: 'Comprobante de pago',
                    file: receiptFiles[index],
                    attachedLabel: item.receiptFileId ? 'Comprobante adjunto' : null,
                    attachedColor: 'success',
                    locked: isItemLocked(index),
                    onPick: () => fileInputRefs.current[index]?.click(),
                    onPaste: (e) => handlePasteForItem(index, e),
                    onClear: () => clearReceiptForItem(index),
                  })}
                </Grid>
                <Grid item xs={12} sm={6}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    hidden
                    ref={(el) => { referenceFileInputRefs.current[index] = el; }}
                    onChange={(e) => handleReferenceFileChange(index, e.target.files?.[0] ?? null)}
                  />
                  {renderImageField({
                    label: 'Imagen de referencia',
                    file: referenceFiles[index],
                    attachedLabel: item.referenceFileId ? 'Referencia adjunta' : null,
                    attachedColor: 'secondary',
                    locked: false,
                    onPick: () => referenceFileInputRefs.current[index]?.click(),
                    onPaste: (e) => handlePasteReferenceForItem(index, e),
                    onClear: () => clearReferenceForItem(index),
                  })}
                </Grid>
              </Grid>
            </Stack>
          </CardContent>
        </Card>
        );
      })}
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

            {areaOrMachine && (
              <Stack direction="row" justifyContent="space-between" spacing={2}>
                <Typography color="text.secondary" sx={{ flexShrink: 0 }}>
                  Área encargada:
                </Typography>
                <Typography fontWeight={500} textAlign="right">
                  {areaOrMachine}
                  {machineId &&
                    ` · ${(machines ?? []).find((m) => m.id === machineId)?.name ?? existingOG?.machine?.name ?? ''}`}
                </Typography>
              </Stack>
            )}

            {workOrderId && (
              <Stack direction="row" justifyContent="space-between" spacing={2}>
                <Typography color="text.secondary" sx={{ flexShrink: 0 }}>
                  Ítems de la OT:
                </Typography>
                <Typography fontWeight={500} textAlign="right">
                  {workOrderItemIds.length ? selectedWorkOrderItemsLabel : 'Toda la OT'}
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
          cambiar de comprobante.
          {correctableItemCount > 0
            ? ' Su método de pago y banco sí se pueden corregir mientras la caja de donde salieron siga abierta.'
            : ' Tampoco se les puede cambiar el método de pago ni el banco: la caja de donde salieron ya se cerró.'}
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

      <ConfirmDialog
        open={pendingWorkOrderItemIds !== null}
        title="Quitar ítem de la OT"
        message="El formulario de gasto de ese ítem ya tiene datos (precio, proveedor o imágenes). Si lo quitas, se borra. ¿Continuar?"
        confirmText="Quitar"
        onConfirm={() => {
          if (pendingWorkOrderItemIds) commitWorkOrderItemSelection(pendingWorkOrderItemIds);
          setPendingWorkOrderItemIds(null);
        }}
        onCancel={() => setPendingWorkOrderItemIds(null)}
      />
    </Box>
  );
};

export default ExpenseOrderFormPage;
