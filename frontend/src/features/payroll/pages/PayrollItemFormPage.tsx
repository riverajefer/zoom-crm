import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddPayrollEmployeeDialog from '../components/AddPayrollEmployeeDialog';
import { DatePicker } from '@mui/x-date-pickers';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useForm, Controller } from 'react-hook-form';
import { PageHeader } from '../../../components/common/PageHeader';
import { PayrollSlipButton } from '../components/PayrollSlipButton';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { usePayrollItems } from '../hooks/usePayrollItems';
import { usePayrollPeriods } from '../hooks/usePayrollPeriods';
import { usePayrollEmployees } from '../hooks/usePayrollEmployees';
import { payrollItemsApi } from '../../../api/payroll-items.api';
import { payrollPeriodsApi } from '../../../api/payroll-periods.api';
import { advanceDisbursed, advanceNotDisbursed, sumDisbursed, sumNotDisbursed } from '../utils/advances';
import { useQuery } from '@tanstack/react-query';
import type { CreatePayrollItemDto, UpdatePayrollItemDto } from '../../../types';
import { PATHS } from '../../../router/paths';

// ─── Extra shift row (managed outside RHF, which is Record<string,string>) ─────
interface ExtraShiftRow {
  shiftDate: Date | null;
  description: string;
  amount: string; // raw digits
}

// ─── Types ───────────────────────────────────────────────────────────────────
type FieldName =
  | 'daysWorked' | 'baseSalary'
  | 'overtimeDaytimeHours' | 'overtimeNighttimeHours'
  | 'overtimeDaytimeValue' | 'overtimeNighttimeValue'
  | 'commissions' | 'restDayValue' | 'transportAllowance'
  | 'workdayDiscount' | 'loans' | 'advances' | 'nonPaidDays'
  | 'epsAndPensionDiscount' | 'employeeFundSavings' | 'orderDeductions'
  | 'totalPayment' | 'observations';

type FormValues = Record<FieldName, string>;

// ─── Currency helpers ────────────────────────────────────────────────────────
const formatCurrencyInput = (rawDigits: string): string => {
  if (!rawDigits) return '';
  const n = parseInt(rawDigits.replace(/\D/g, ''), 10);
  if (isNaN(n)) return '';
  return new Intl.NumberFormat('es-CO').format(n);
};

const formatCOP = (value: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

// Raw integer from form string
const rawNum = (v: string | undefined): number => Number(v?.replace(/\D/g, '') ?? 0);

// ─── Total calculation (reads raw digit strings) ──────────────────────────────
const calcTotal = (v: Partial<FormValues>, extraShiftsTotal = 0): number =>
  rawNum(v.baseSalary) +
  rawNum(v.overtimeDaytimeValue) +
  rawNum(v.overtimeNighttimeValue) +
  rawNum(v.commissions) +
  rawNum(v.restDayValue) +
  rawNum(v.transportAllowance) +
  extraShiftsTotal -
  rawNum(v.workdayDiscount) -
  rawNum(v.loans) -
  rawNum(v.advances) -
  rawNum(v.nonPaidDays) -
  rawNum(v.epsAndPensionDiscount) -
  rawNum(v.employeeFundSavings) -
  rawNum(v.orderDeductions);

// Sum of extra-shift amounts (raw digits)
const sumShifts = (rows: ExtraShiftRow[]): number =>
  rows.reduce((acc, r) => acc + rawNum(r.amount), 0);

// ─── Salario base proporcional (convención colombiana: mes = 30 días) ─────────
// REGULAR: (salarioMensual / 30) × díasTrabajados; sin días → periodo completo
//   (quincena = salario/2, mes = salario completo).
// TEMPORAL: tarifaDiaria × díasTrabajados.
const computeBaseSalary = (
  emp: { employeeType?: string; monthlySalary?: string | null; dailyRate?: string | null } | undefined,
  periodType: string | undefined,
  daysWorkedStr: string,
): number | null => {
  if (!emp) return null;
  const days = daysWorkedStr ? Number(daysWorkedStr) : null;
  if (emp.employeeType === 'TEMPORARY') {
    const rate = emp.dailyRate ? Number(emp.dailyRate) : 0;
    return Math.round(rate * (days ?? 0));
  }
  const monthly = emp.monthlySalary ? Number(emp.monthlySalary) : 0;
  if (days == null) {
    return Math.round(periodType === 'BIWEEKLY' ? monthly / 2 : monthly);
  }
  return Math.round((monthly / 30) * days);
};

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Currency field: stores raw digit string, displays formatted COP */
const CurrencyField: React.FC<{
  control: any;
  name: FieldName;
  label: string;
  readOnly?: boolean;
}> = ({ control, name, label, readOnly = false }) => (
  <Controller
    name={name}
    control={control}
    render={({ field }) => (
      <TextField
        fullWidth
        label={label}
        size="small"
        value={field.value ? formatCurrencyInput(field.value) : ''}
        onChange={readOnly ? undefined : (e) => field.onChange(e.target.value.replace(/\D/g, ''))}
        InputProps={{
          readOnly,
          startAdornment: (
            <InputAdornment position="start">
              <Typography sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.875rem' }}>$</Typography>
            </InputAdornment>
          ),
          inputProps: { style: { textAlign: 'right' } },
        }}
        sx={readOnly ? { '& .MuiInputBase-root': { bgcolor: 'action.hover' } } : undefined}
      />
    )}
  />
);

/** Plain numeric field: for hours and days (no currency formatting) */
const NumberField: React.FC<{
  control: any;
  name: FieldName;
  label: string;
  prefix?: string;
}> = ({ control, name, label, prefix = '' }) => (
  <Controller
    name={name}
    control={control}
    render={({ field }) => (
      <TextField
        {...field}
        fullWidth
        label={label}
        type="number"
        size="small"
        InputProps={
          prefix
            ? {
                startAdornment: (
                  <InputAdornment position="start">
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{prefix}</Typography>
                  </InputAdornment>
                ),
              }
            : undefined
        }
      />
    )}
  />
);

// ─── Page ────────────────────────────────────────────────────────────────────
const PayrollItemFormPage: React.FC = () => {
  const { periodId, itemId } = useParams<{ periodId: string; itemId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const isNew = itemId === 'new';
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { getPeriodQuery } = usePayrollPeriods();
  const periodQuery = getPeriodQuery(periodId!);
  const period = periodQuery.data;

  const itemQuery = useQuery({
    queryKey: ['payroll-item', itemId],
    queryFn: () => payrollItemsApi.getByPeriod(periodId!).then((items) => items.find((i) => i.id === itemId)),
    enabled: !isNew && !!itemId,
  });

  const { createMutation, updateMutation, itemsQuery } = usePayrollItems(periodId!);
  const { employeesQuery } = usePayrollEmployees();

  // Anticipos (Cuentas por Pagar Personal/Anticipos) vinculados a este periodo.
  const advancesQuery = useQuery({
    queryKey: ['payroll-advances', periodId],
    queryFn: () => payrollPeriodsApi.getAdvances(periodId!),
    enabled: !!periodId,
  });

  // Empleado a agregar (solo modo nuevo)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  // Días trabajados cargados desde el registro (para no recalcular la base al abrir en edición)
  const loadedDaysRef = useRef<string | null>(null);
  const existingEmployeeIds = new Set((itemsQuery.data ?? []).map((i) => i.employeeId));
  const availableEmployees = (employeesQuery.data ?? []).filter(
    (e) => !existingEmployeeIds.has(e.id),
  );
  const existingUserIds = (employeesQuery.data ?? []).map((e) => e.userId);
  const employeeLabel = (e: (typeof availableEmployees)[number]) =>
    `${e.user?.firstName ?? ''} ${e.user?.lastName ?? ''}`.trim() || e.user?.email || 'Empleado';

  const defaultValues: FormValues = {
    daysWorked: '', baseSalary: '',
    overtimeDaytimeHours: '', overtimeNighttimeHours: '',
    overtimeDaytimeValue: '', overtimeNighttimeValue: '',
    commissions: '', restDayValue: '', transportAllowance: '',
    workdayDiscount: '', loans: '', advances: '', nonPaidDays: '',
    epsAndPensionDiscount: '', employeeFundSavings: '', orderDeductions: '',
    totalPayment: '', observations: '',
  };

  const { control, watch, setValue, handleSubmit, reset } = useForm<FormValues>({ defaultValues });
  const values = watch();

  // Extra shifts (managed outside RHF)
  const [shifts, setShifts] = useState<ExtraShiftRow[]>([]);
  const extraShiftsTotal = sumShifts(shifts);

  const addShift = () =>
    setShifts((prev) => [...prev, { shiftDate: null, description: '', amount: '' }]);
  const updateShift = (idx: number, patch: Partial<ExtraShiftRow>) =>
    setShifts((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeShift = (idx: number) =>
    setShifts((prev) => prev.filter((_, i) => i !== idx));

  // Auto-calc: horas extra diurnas → valor
  useEffect(() => {
    if (period?.overtimeDaytimeRate && values.overtimeDaytimeHours) {
      const val = Number(values.overtimeDaytimeHours) * Number(period.overtimeDaytimeRate);
      setValue('overtimeDaytimeValue', Math.round(val).toString());
    }
  }, [values.overtimeDaytimeHours, period?.overtimeDaytimeRate]);

  // Auto-calc: horas extra nocturnas → valor
  useEffect(() => {
    if (period?.overtimeNighttimeRate && values.overtimeNighttimeHours) {
      const val = Number(values.overtimeNighttimeHours) * Number(period.overtimeNighttimeRate);
      setValue('overtimeNighttimeValue', Math.round(val).toString());
    }
  }, [values.overtimeNighttimeHours, period?.overtimeNighttimeRate]);

  // Auto-calc base proporcional al crear: al elegir empleado o cambiar días (editable)
  useEffect(() => {
    if (!isNew || !selectedEmployeeId) return;
    const emp = availableEmployees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;
    const base = computeBaseSalary(emp, period?.periodType, values.daysWorked);
    if (base != null) setValue('baseSalary', base.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, selectedEmployeeId, values.daysWorked, period?.periodType, employeesQuery.data]);

  // Auto-calc base proporcional al editar: solo cuando el usuario cambia los días
  // (no al cargar el registro, para respetar el valor guardado).
  useEffect(() => {
    if (isNew || loadedDaysRef.current === null) return;
    if (values.daysWorked === loadedDaysRef.current) return;
    const emp = itemQuery.data?.employee;
    if (!emp) return;
    const base = computeBaseSalary(emp, period?.periodType, values.daysWorked);
    if (base != null) setValue('baseSalary', base.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, values.daysWorked, period?.periodType, itemQuery.data]);

  // Auto-calc total
  useEffect(() => {
    const total = calcTotal(values, extraShiftsTotal);
    setValue('totalPayment', Math.round(total).toString());
  }, [
    values.baseSalary, values.overtimeDaytimeValue, values.overtimeNighttimeValue,
    values.commissions, values.restDayValue, values.transportAllowance,
    values.workdayDiscount, values.loans, values.advances, values.nonPaidDays,
    values.epsAndPensionDiscount, values.employeeFundSavings, values.orderDeductions,
    extraShiftsTotal,
  ]);

  // Load existing item
  useEffect(() => {
    if (!isNew && itemQuery.data) {
      const item = itemQuery.data;
      // Strip decimals from Prisma Decimal strings for COP integer storage
      const toRaw = (v: any) => v != null ? Math.round(Number(v)).toString() : '';
      loadedDaysRef.current = item.daysWorked?.toString() ?? '';
      reset({
        daysWorked: item.daysWorked?.toString() ?? '',
        baseSalary: toRaw(item.baseSalary),
        overtimeDaytimeHours: item.overtimeDaytimeHours?.toString() ?? '',
        overtimeNighttimeHours: item.overtimeNighttimeHours?.toString() ?? '',
        overtimeDaytimeValue: toRaw(item.overtimeDaytimeValue),
        overtimeNighttimeValue: toRaw(item.overtimeNighttimeValue),
        commissions: toRaw(item.commissions),
        restDayValue: toRaw(item.restDayValue),
        transportAllowance: toRaw(item.transportAllowance),
        workdayDiscount: toRaw(item.workdayDiscount),
        loans: toRaw(item.loans),
        advances: toRaw(item.advances),
        nonPaidDays: toRaw(item.nonPaidDays),
        epsAndPensionDiscount: toRaw(item.epsAndPensionDiscount),
        employeeFundSavings: toRaw(item.employeeFundSavings),
        orderDeductions: toRaw(item.orderDeductions),
        totalPayment: toRaw(item.totalPayment),
        observations: item.observations ?? '',
      });
      setShifts(
        (item.extraShifts ?? []).map((s) => ({
          shiftDate: s.shiftDate ? new Date(s.shiftDate) : null,
          description: s.description ?? '',
          amount: s.amount != null ? Math.round(Number(s.amount)).toString() : '',
        })),
      );
    }
  }, [isNew, itemQuery.data, reset]);

  const item = itemQuery.data;
  const employeeName = item
    ? `${item.employee?.user?.firstName ?? ''} ${item.employee?.user?.lastName ?? ''}`.trim()
    : 'Empleado';

  const onSubmit = async (vals: FormValues) => {
    setServerError(null);
    const num = (k: FieldName) => vals[k] ? Number(vals[k].replace(/\D/g, '')) : undefined;
    const fields = {
      daysWorked: vals.daysWorked ? Number(vals.daysWorked) : undefined,
      baseSalary: num('baseSalary'),
      overtimeDaytimeHours: vals.overtimeDaytimeHours ? Number(vals.overtimeDaytimeHours) : undefined,
      overtimeNighttimeHours: vals.overtimeNighttimeHours ? Number(vals.overtimeNighttimeHours) : undefined,
      overtimeDaytimeValue: num('overtimeDaytimeValue'),
      overtimeNighttimeValue: num('overtimeNighttimeValue'),
      commissions: num('commissions'),
      restDayValue: num('restDayValue'),
      transportAllowance: num('transportAllowance'),
      workdayDiscount: num('workdayDiscount'),
      loans: num('loans'),
      advances: num('advances'),
      nonPaidDays: num('nonPaidDays'),
      epsAndPensionDiscount: num('epsAndPensionDiscount'),
      employeeFundSavings: num('employeeFundSavings'),
      // `orderDeductions` NO se manda: es de solo lectura y lo mantiene el
      // módulo de descuentos. El backend lo rechazaría (`forbidNonWhitelisted`),
      // y su valor ya está incluido en el `totalPayment` que sí se envía.
      totalPayment: num('totalPayment'),
      observations: vals.observations || undefined,
      extraShifts: shifts
        .filter((r) => r.shiftDate && rawNum(r.amount) > 0)
        .map((r) => ({
          shiftDate: r.shiftDate!.toISOString(),
          description: r.description.trim() || undefined,
          amount: rawNum(r.amount),
        })),
    };
    try {
      if (isNew) {
        if (!selectedEmployeeId) {
          setServerError('Selecciona un empleado para el registro');
          enqueueSnackbar('Selecciona un empleado', { variant: 'warning' });
          return;
        }
        const createPayload: CreatePayrollItemDto = {
          employeeId: selectedEmployeeId,
          ...fields,
          baseSalary: fields.baseSalary ?? 0,
          totalPayment: fields.totalPayment ?? 0,
        };
        await createMutation.mutateAsync(createPayload);
        enqueueSnackbar('Registro de nómina creado', { variant: 'success' });
        navigate(PATHS.PAYROLL_PERIODS_DETAIL.replace(':id', periodId!));
        return;
      }
      await updateMutation.mutateAsync({ itemId: itemId!, data: fields as UpdatePayrollItemDto });
      enqueueSnackbar('Registro de nómina actualizado', { variant: 'success' });
      navigate(PATHS.PAYROLL_PERIODS_DETAIL.replace(':id', periodId!));
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? 'Error al guardar';
      setServerError(message);
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  // ── Anticipos vinculados del empleado de este registro ─────────────────────
  const employeeUserId = isNew
    ? (employeesQuery.data ?? []).find((e) => e.id === selectedEmployeeId)?.userId
    : itemQuery.data?.employee?.user?.id;
  const employeeAdvances = (advancesQuery.data ?? []).filter(
    (a) => !!employeeUserId && a.beneficiaryUser?.id === employeeUserId,
  );
  // Solo se descuenta lo que Caja desembolsó: un anticipo rechazado o vencido
  // sigue vinculado, pero el empleado nunca recibió ese dinero.
  const advancesTotal = sumDisbursed(employeeAdvances);
  const advancesNotDisbursed = sumNotDisbursed(employeeAdvances);
  const currentAdvancesValue = rawNum(values.advances);
  const applyAdvancesDiscount = () => setValue('advances', String(Math.round(advancesTotal)));

  if (!isNew && itemQuery.isLoading) return <LoadingSpinner />;
  const isLoading = updateMutation.isPending || createMutation.isPending;
  const totalValue = calcTotal(values, extraShiftsTotal);

  return (
    <Box>
      <PageHeader
        title={isNew ? 'Nuevo Registro de Nómina' : `Registro de Nómina — ${employeeName}`}
        subtitle={period?.name ?? ''}
        breadcrumbs={[
          { label: 'Periodos', path: PATHS.PAYROLL_PERIODS },
          { label: period?.name ?? 'Periodo', path: PATHS.PAYROLL_PERIODS_DETAIL.replace(':id', periodId!) },
          { label: isNew ? 'Nuevo' : employeeName },
        ]}
      />

      {/* El desprendible refleja el registro guardado, no los cambios sin guardar. */}
      {!isNew && item && period && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <PayrollSlipButton item={item} period={period} variant="toolbar" />
        </Box>
      )}

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        {serverError && <Alert severity="error" sx={{ mb: 2 }}>{serverError}</Alert>}

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* ── EMPLEADO (solo al crear) ───────────────────────────────── */}
          {isNew && (
            <>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Empleado</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Autocomplete
                      sx={{ flexGrow: 1 }}
                      options={availableEmployees}
                      getOptionLabel={employeeLabel}
                      loading={employeesQuery.isLoading || itemsQuery.isLoading}
                      value={availableEmployees.find((e) => e.id === selectedEmployeeId) ?? null}
                      onChange={(_, value) => setSelectedEmployeeId(value?.id ?? '')}
                      isOptionEqualToValue={(opt, val) => opt.id === val.id}
                      noOptionsText="No hay empleados disponibles para agregar"
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          label="Selecciona un empleado *"
                          helperText="Solo se muestran empleados que aún no están en este periodo"
                        />
                      )}
                    />
                    <Tooltip title="Registrar un nuevo empleado en nómina">
                      <IconButton
                        color="primary"
                        onClick={() => setAddEmployeeOpen(true)}
                        aria-label="Agregar empleado a nómina"
                        sx={{ mt: 0.5 }}
                      >
                        <PersonAddAlt1Icon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Grid>
              </Grid>
              <Divider sx={{ my: 3 }} />
            </>
          )}

          {/* ── INGRESOS ───────────────────────────────────────────────── */}
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Ingresos</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            El salario base se calcula automáticamente desde el salario del empleado y los días
            trabajados (mes = 30 días). Puedes ajustarlo manualmente si lo necesitas.
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <NumberField control={control} name="daysWorked" label="Días trabajados" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="baseSalary" label="Salario base proporcional" />
            </Grid>
            <Grid item xs={6} md={3}>
              <NumberField control={control} name="overtimeDaytimeHours" label="Horas extra diurnas" prefix="h" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="overtimeDaytimeValue" label="Valor extras diurnas" readOnly />
            </Grid>
            <Grid item xs={6} md={3}>
              <NumberField control={control} name="overtimeNighttimeHours" label="Horas extra nocturnas" prefix="h" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="overtimeNighttimeValue" label="Valor extras nocturnas" readOnly />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="commissions" label="Comisiones" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="restDayValue" label="Día de descanso / vacaciones" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="transportAllowance" label="Auxilio de transporte" />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* ── TURNOS EXTRAS ──────────────────────────────────────────── */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight="bold">Turnos extras</Typography>
              <Typography variant="caption" color="text.secondary">
                Turnos acordados con pago fijo (ej. domingo completo). Se suman al total.
              </Typography>
            </Box>
            <Button size="small" startIcon={<AddIcon />} onClick={addShift}>
              Agregar turno
            </Button>
          </Stack>

          {shifts.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              Sin turnos extras registrados.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {shifts.map((row, idx) => (
                <Grid container spacing={2} alignItems="center" key={idx}>
                  <Grid item xs={12} sm={4} md={3}>
                    <DatePicker
                      label="Fecha del turno"
                      value={row.shiftDate}
                      onChange={(d) => updateShift(idx, { shiftDate: d as Date | null })}
                      slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={5} md={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Descripción"
                      value={row.description}
                      onChange={(e) => updateShift(idx, { description: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={9} sm={2} md={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Valor acordado"
                      value={row.amount ? formatCurrencyInput(row.amount) : ''}
                      onChange={(e) => updateShift(idx, { amount: e.target.value.replace(/\D/g, '') })}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.875rem' }}>$</Typography>
                          </InputAdornment>
                        ),
                        inputProps: { style: { textAlign: 'right' } },
                      }}
                    />
                  </Grid>
                  <Grid item xs={3} sm={1} md={1} sx={{ textAlign: 'center' }}>
                    <IconButton color="error" onClick={() => removeShift(idx)} aria-label="Eliminar turno">
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}
              <Box sx={{ textAlign: 'right', pr: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Subtotal turnos extras:{' '}
                  <Typography component="span" fontWeight="bold" color="text.primary">
                    {formatCOP(extraShiftsTotal)}
                  </Typography>
                </Typography>
              </Box>
            </Stack>
          )}

          <Divider sx={{ my: 3 }} />

          {/* ── DESCUENTOS ─────────────────────────────────────────────── */}
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Descuentos</Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="workdayDiscount" label="Descuento día laboral" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="loans" label="Préstamos" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="advances" label="Anticipos" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="nonPaidDays" label="Días no remunerados / incapacidad" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField control={control} name="epsAndPensionDiscount" label="EPS y Pensión" />
            </Grid>
            <Grid item xs={6} md={3}>
              <CurrencyField
                control={control}
                name="employeeFundSavings"
                label="Ahorro fondo de empleados"
              />
            </Grid>
            {/* Solo lectura: lo mantiene el módulo de descuentos por nómina, no
                se digita acá. Editarlo a mano dejaría el renglón peleado con la
                orden que lo originó y con el abono que la saldó. */}
            <Grid item xs={6} md={3}>
              <CurrencyField
                control={control}
                name="orderDeductions"
                label="Órdenes descontadas"
                readOnly
              />
            </Grid>
          </Grid>

          {/* ── ANTICIPOS VINCULADOS (Cuentas por Pagar) ──────────────────── */}
          {employeeAdvances.length > 0 && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'warning.main',
                bgcolor: 'warning.soft',
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={1}
                sx={{ mb: 1 }}
              >
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Anticipos vinculados del empleado
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Cuentas por Pagar (Personal / Anticipos) registradas para este empleado en el periodo.
                    Solo se descuenta lo que Caja ya desembolsó.
                  </Typography>
                  {advancesNotDisbursed > 0 && (
                    <Typography variant="caption" color="warning.main" component="div">
                      {formatCOP(advancesNotDisbursed)} vinculados sin desembolsar quedan por fuera del descuento.
                    </Typography>
                  )}
                </Box>
                <Tooltip title="Copiar el total desembolsado al campo de descuento 'Anticipos'">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      onClick={applyAdvancesDiscount}
                      disabled={currentAdvancesValue === Math.round(advancesTotal)}
                    >
                      Aplicar como descuento
                    </Button>
                  </span>
                </Tooltip>
              </Stack>

              <Stack spacing={0.5}>
                {employeeAdvances.map((a) => {
                  const pending = advanceNotDisbursed(a);
                  return (
                    <Stack key={a.id} direction="row" justifyContent="space-between" spacing={2}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.apNumber} — {a.description || 'Anticipo'}
                        </Typography>
                        {pending > 0 && (
                          <Typography variant="caption" color="warning.main" component="div">
                            {formatCOP(pending)} de {formatCOP(Number(a.totalAmount))} sin desembolsar por Caja: no se descuenta
                          </Typography>
                        )}
                      </Box>
                      <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
                        {formatCOP(advanceDisbursed(a))}
                      </Typography>
                    </Stack>
                  );
                })}
                <Divider sx={{ my: 0.5 }} />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" fontWeight="bold">Total desembolsado</Typography>
                  <Typography variant="body2" fontWeight="bold" color="warning.main">
                    {formatCOP(advancesTotal)}
                  </Typography>
                </Stack>
              </Stack>

              {currentAdvancesValue !== Math.round(advancesTotal) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  El descuento "Anticipos" actual ({formatCOP(currentAdvancesValue)}) difiere del total
                  desembolsado. Usa "Aplicar como descuento" para igualarlo.
                </Typography>
              )}
            </Box>
          )}

          <Divider sx={{ my: 3 }} />

          {/* ── TOTAL + OBSERVACIONES ──────────────────────────────────── */}
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: totalValue >= 0 ? 'success.soft' : 'error.soft',
                  border: '1px solid',
                  borderColor: totalValue >= 0 ? 'success.main' : 'error.main',
                }}
              >
                <Typography variant="caption" color="text.secondary">Total a pagar</Typography>
                <Typography variant="h5" fontWeight="bold" color={totalValue >= 0 ? 'success.main' : 'error.main'}>
                  {formatCOP(totalValue)}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={12} md={8}>
              <Controller
                name="observations"
                control={control}
                render={({ field }) => (
                  <TextField {...field} fullWidth label="Observaciones de nómina" multiline rows={2} size="small" />
                )}
              />
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }}>
            <Button variant="contained" type="submit" disabled={isLoading} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              {isLoading ? 'Guardando...' : 'Guardar Registro'}
            </Button>
            <Button variant="outlined" onClick={() => navigate(PATHS.PAYROLL_PERIODS_DETAIL.replace(':id', periodId!))} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Cancelar
            </Button>
          </Stack>
        </form>
      </Paper>

      {isNew && (
        <AddPayrollEmployeeDialog
          open={addEmployeeOpen}
          onClose={() => setAddEmployeeOpen(false)}
          existingUserIds={existingUserIds}
          onCreated={(employee) => setSelectedEmployeeId(employee.id)}
        />
      )}
    </Box>
  );
};

export default PayrollItemFormPage;
