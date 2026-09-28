import { PrismaClient, AccountPayableStatus, PaymentMethod } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthsFromNow(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  console.log('\n💳 Seeding Accounts Payable...\n');

  // ── Lookup base data ──────────────────────────────────────────────────────
  const adminUser = await prisma.user.findFirst({ where: { username: 'adminsistema' } });
  if (!adminUser) throw new Error('Admin user not found. Run main seed first.');

  const supplierByEmail = async (email: string) =>
    prisma.supplier.findFirst({ where: { email } });

  const [
    supplierTintas,
    supplierPapeleria,
    supplierAcrilicos,
    supplierTextiles,
    supplierMaderas,
    supplierSuministros,
    supplierVinilos,
    supplierMetales,
    supplierEmpaques,
    supplierTecImpresion,
  ] = await Promise.all([
    supplierByEmail('ventas@tintasycolores.com'),
    supplierByEmail('contacto@papeleriaindustrial.com'),
    supplierByEmail('info@acrilicosyvalle.com'),
    supplierByEmail('ventas@textilesyconfecciones.com'),
    supplierByEmail('contacto@maderaspremium.com'),
    supplierByEmail('express@suministrosgraficos.com'),
    supplierByEmail('ventas@vinilosyadhesivos.co'),
    supplierByEmail('info@metalesdelsur.com'),
    supplierByEmail('contacto@empaquesycajas.com'),
    supplierByEmail('ventas@tecimpresion.com'),
  ]);

  const expenseTypeByName = async (name: string) =>
    prisma.expenseType.findFirst({ where: { name } });

  const subcategoryByName = async (name: string, expenseTypeId: string) =>
    prisma.expenseSubcategory.findFirst({ where: { name, expenseTypeId } });

  const [etOperativos, etProduccion, etAdministrativos, etPersonal, etRecurrentes] =
    await Promise.all([
      expenseTypeByName('Operativos'),
      expenseTypeByName('Producción'),
      expenseTypeByName('Administrativos'),
      expenseTypeByName('Personal'),
      expenseTypeByName('Servicios recurrentes'),
    ]);

  if (!etOperativos || !etProduccion || !etAdministrativos || !etPersonal || !etRecurrentes) {
    throw new Error('Expense types not found. Run seed-expenses.ts first.');
  }

  const [
    scArriendo, scInternet, scLuzAgua, scHosting, scLicencias,
    scContador, scAsesoriaLegal, scSoftware, scBancos, scNotaria, scComisiones,
    scPapeleria, scHerramientas, scCombustible, scMantenimiento, scInsumosInternos, scMensajeria, scAlimentacion,
    scMaterialesCliente, scSubcontratados, scTintas, scInsumosProduccion, scCostosDirectos,
    scAnticipos, scViaticos, scCapacitacion,
  ] = await Promise.all([
    subcategoryByName('Arriendo', etRecurrentes.id),
    subcategoryByName('Internet', etRecurrentes.id),
    subcategoryByName('Luz / agua', etRecurrentes.id),
    subcategoryByName('Hosting', etRecurrentes.id),
    subcategoryByName('Licencias', etRecurrentes.id),
    subcategoryByName('Contador', etAdministrativos.id),
    subcategoryByName('Asesoría legal', etAdministrativos.id),
    subcategoryByName('Software', etAdministrativos.id),
    subcategoryByName('Bancos', etAdministrativos.id),
    subcategoryByName('Notaría', etAdministrativos.id),
    subcategoryByName('Comisiones', etAdministrativos.id),
    subcategoryByName('Papelería', etOperativos.id),
    subcategoryByName('Herramientas', etOperativos.id),
    subcategoryByName('Combustible', etOperativos.id),
    subcategoryByName('Mantenimiento', etOperativos.id),
    subcategoryByName('Insumos internos', etOperativos.id),
    subcategoryByName('Mensajería', etOperativos.id),
    subcategoryByName('Alimentación', etOperativos.id),
    subcategoryByName('Compra de materiales para cliente', etProduccion.id),
    subcategoryByName('Servicios subcontratados', etProduccion.id),
    subcategoryByName('Tintas para máquinas', etProduccion.id),
    subcategoryByName('Insumos para máquinas', etProduccion.id),
    subcategoryByName('Costos directos de orden de trabajo', etProduccion.id),
    subcategoryByName('Anticipos', etPersonal.id),
    subcategoryByName('Viáticos', etPersonal.id),
    subcategoryByName('Capacitación', etPersonal.id),
  ]);

  // ── Helper: create AP then payments & installments ────────────────────────
  type InstallmentDef = { amount: number; dueDate: Date; isPaid: boolean; paidAt?: Date };
  type PaymentDef = { amount: number; method: PaymentMethod; reference?: string; date: Date };

  async function createAP(opts: {
    apNumber: string;
    expenseTypeId: string;
    expenseSubcategoryId: string;
    status: AccountPayableStatus;
    description: string;
    observations?: string;
    totalAmount: number;
    dueDate: Date;
    isRecurring?: boolean;
    recurringDay?: number;
    supplierId?: string | null;
    createdAt?: Date;
    payments?: PaymentDef[];
    installments?: InstallmentDef[];
    cancelReason?: string;
  }) {
    const existing = await prisma.accountPayable.findUnique({ where: { apNumber: opts.apNumber } });
    if (existing) {
      console.log(`  ↩  Skipped (already exists): ${opts.apNumber}`);
      return existing;
    }

    const paidAmount = (opts.payments ?? []).reduce((s, p) => s + p.amount, 0);
    const balance = opts.totalAmount - paidAmount;

    // Las CP demo van a la Matriz, dueña de los gastos comunes (docs/PLAN_SEDES.md §14).
    const matriz = await prisma.location.findUniqueOrThrow({ where: { code: 'MAT' }, select: { id: true } });
    const ap = await prisma.accountPayable.create({
      data: {
        apNumber: opts.apNumber,
        locationId: matriz.id,
        expenseTypeId: opts.expenseTypeId,
        expenseSubcategoryId: opts.expenseSubcategoryId,
        status: opts.status,
        description: opts.description,
        observations: opts.observations,
        totalAmount: opts.totalAmount,
        paidAmount,
        balance,
        dueDate: opts.dueDate,
        isRecurring: opts.isRecurring ?? false,
        recurringDay: opts.recurringDay,
        supplierId: opts.supplierId,
        createdById: adminUser!.id,
        createdAt: opts.createdAt,
        ...(opts.status === 'CANCELLED' && {
          cancelledAt: new Date(),
          cancelledById: adminUser!.id,
          cancelReason: opts.cancelReason ?? 'Cancelado',
        }),
      },
    });

    for (const p of opts.payments ?? []) {
      await prisma.accountPayablePayment.create({
        data: {
          accountPayableId: ap.id,
          amount: p.amount,
          paymentMethod: p.method,
          reference: p.reference,
          paymentDate: p.date,
          registeredById: adminUser!.id,
        },
      });
    }

    for (let i = 0; i < (opts.installments ?? []).length; i++) {
      const inst = opts.installments![i];
      await prisma.accountPayableInstallment.create({
        data: {
          accountPayableId: ap.id,
          installmentNumber: i + 1,
          amount: inst.amount,
          dueDate: inst.dueDate,
          isPaid: inst.isPaid,
          paidAt: inst.paidAt,
          paidById: inst.isPaid ? adminUser!.id : undefined,
        },
      });
    }

    console.log(`  ✓ ${opts.apNumber} — ${opts.description} [${opts.status}]`);
    return ap;
  }

  // ── 25 Records ─────────────────────────────────────────────────────────────

  // 1. Arriendo mensual — PAID — recurrente
  await createAP({
    apNumber: 'CP-2026-0001',
    expenseTypeId: etRecurrentes.id,
    expenseSubcategoryId: scArriendo!.id,
    status: 'PAID',
    description: 'Arriendo local comercial — febrero 2026',
    observations: 'Pago puntual. Incluye depósito de garantía prorrateado.',
    totalAmount: 2_500_000,
    dueDate: new Date('2026-02-01'),
    isRecurring: true,
    recurringDay: 1,
    supplierId: supplierMaderas?.id,
    createdAt: new Date('2026-01-25'),
    payments: [
      { amount: 2_500_000, method: 'TRANSFER', reference: 'TRF-2026-00312', date: new Date('2026-02-01') },
    ],
  });

  // 2. Internet fibra óptica — PAID — recurrente
  await createAP({
    apNumber: 'CP-2026-0002',
    expenseTypeId: etRecurrentes.id,
    expenseSubcategoryId: scInternet!.id,
    status: 'PAID',
    description: 'Internet fibra óptica 500 MB — febrero 2026',
    totalAmount: 149_900,
    dueDate: new Date('2026-02-10'),
    isRecurring: true,
    recurringDay: 10,
    createdAt: new Date('2026-02-05'),
    payments: [
      { amount: 149_900, method: 'TRANSFER', reference: 'TRF-2026-00415', date: new Date('2026-02-10') },
    ],
  });

  // 3. Luz y agua — PARTIAL
  await createAP({
    apNumber: 'CP-2026-0003',
    expenseTypeId: etRecurrentes.id,
    expenseSubcategoryId: scLuzAgua!.id,
    status: 'PARTIAL',
    description: 'Factura luz y agua — febrero 2026',
    observations: 'Abono parcial. Saldo pendiente para cierre de mes.',
    totalAmount: 380_000,
    dueDate: new Date('2026-03-15'),
    isRecurring: true,
    recurringDay: 15,
    createdAt: new Date('2026-02-20'),
    payments: [
      { amount: 200_000, method: 'CASH', date: new Date('2026-03-05') },
    ],
  });

  // 4. Hosting web — PENDING — recurrente
  await createAP({
    apNumber: 'CP-2026-0004',
    expenseTypeId: etRecurrentes.id,
    expenseSubcategoryId: scHosting!.id,
    status: 'PENDING',
    description: 'Hosting servidor web — mayo 2026',
    totalAmount: 480_000,
    dueDate: daysFromNow(9),
    isRecurring: true,
    recurringDay: 5,
    createdAt: daysAgo(5),
  });

  // 5. Licencias Adobe Creative Cloud — PENDING
  await createAP({
    apNumber: 'CP-2026-0005',
    expenseTypeId: etRecurrentes.id,
    expenseSubcategoryId: scLicencias!.id,
    status: 'PENDING',
    description: 'Licencia Adobe Creative Cloud — equipo diseño (5 usuarios)',
    totalAmount: 1_250_000,
    dueDate: daysFromNow(23),
    createdAt: daysAgo(7),
  });

  // 6. Honorarios contador — PAID — plan cuotas 3 cuotas todas pagadas
  await createAP({
    apNumber: 'CP-2026-0006',
    expenseTypeId: etAdministrativos.id,
    expenseSubcategoryId: scContador!.id,
    status: 'PAID',
    description: 'Honorarios contador — Q1 2026 (enero–marzo)',
    observations: 'Pago en 3 cuotas mensuales.',
    totalAmount: 1_800_000,
    dueDate: new Date('2026-03-31'),
    createdAt: new Date('2026-01-05'),
    payments: [
      { amount: 600_000, method: 'TRANSFER', reference: 'TRF-2026-00201', date: new Date('2026-01-31') },
      { amount: 600_000, method: 'TRANSFER', reference: 'TRF-2026-00278', date: new Date('2026-02-28') },
      { amount: 600_000, method: 'TRANSFER', reference: 'TRF-2026-00341', date: new Date('2026-03-31') },
    ],
    installments: [
      { amount: 600_000, dueDate: new Date('2026-01-31'), isPaid: true, paidAt: new Date('2026-01-31') },
      { amount: 600_000, dueDate: new Date('2026-02-28'), isPaid: true, paidAt: new Date('2026-02-28') },
      { amount: 600_000, dueDate: new Date('2026-03-31'), isPaid: true, paidAt: new Date('2026-03-31') },
    ],
  });

  // 7. Asesoría legal — PARTIAL — plan cuotas 3 cuotas, 2 pagadas
  await createAP({
    apNumber: 'CP-2026-0007',
    expenseTypeId: etAdministrativos.id,
    expenseSubcategoryId: scAsesoriaLegal!.id,
    status: 'PARTIAL',
    description: 'Asesoría legal contrato distribución — elaboración y revisión',
    observations: 'Contrato a 3 cuotas. Cuota 3 pendiente.',
    totalAmount: 3_500_000,
    dueDate: monthsFromNow(1),
    createdAt: new Date('2026-02-01'),
    payments: [
      { amount: 1_166_666, method: 'TRANSFER', reference: 'TRF-2026-00290', date: new Date('2026-02-28') },
      { amount: 1_166_667, method: 'TRANSFER', reference: 'TRF-2026-00355', date: new Date('2026-03-31') },
    ],
    installments: [
      { amount: 1_166_666, dueDate: new Date('2026-02-28'), isPaid: true, paidAt: new Date('2026-02-28') },
      { amount: 1_166_667, dueDate: new Date('2026-03-31'), isPaid: true, paidAt: new Date('2026-03-31') },
      { amount: 1_166_667, dueDate: monthsFromNow(1), isPaid: false },
    ],
  });

  // 8. Software CRM — PENDING
  await createAP({
    apNumber: 'CP-2026-0008',
    expenseTypeId: etAdministrativos.id,
    expenseSubcategoryId: scSoftware!.id,
    status: 'PENDING',
    description: 'Licencia anual CRM — renovación 2026',
    totalAmount: 2_100_000,
    dueDate: daysFromNow(40),
    createdAt: daysAgo(10),
  });

  // 9. Comisión bancaria préstamo — OVERDUE
  await createAP({
    apNumber: 'CP-2026-0009',
    expenseTypeId: etAdministrativos.id,
    expenseSubcategoryId: scBancos!.id,
    status: 'OVERDUE',
    description: 'Comisión cuota préstamo bancario — enero 2026',
    observations: 'Vencida. Pendiente pago con intereses de mora.',
    totalAmount: 450_000,
    dueDate: new Date('2026-01-31'),
    createdAt: new Date('2026-01-20'),
  });

  // 10. Papelería y útiles — PAID — con proveedor
  await createAP({
    apNumber: 'CP-2026-0010',
    expenseTypeId: etOperativos.id,
    expenseSubcategoryId: scPapeleria!.id,
    status: 'PAID',
    description: 'Papelería y útiles de oficina — febrero 2026',
    totalAmount: 280_000,
    dueDate: new Date('2026-02-28'),
    supplierId: supplierPapeleria?.id,
    createdAt: new Date('2026-02-15'),
    payments: [
      { amount: 280_000, method: 'CASH', date: new Date('2026-02-20') },
    ],
  });

  // 11. Herramientas de corte — PARTIAL — con proveedor
  await createAP({
    apNumber: 'CP-2026-0011',
    expenseTypeId: etOperativos.id,
    expenseSubcategoryId: scHerramientas!.id,
    status: 'PARTIAL',
    description: 'Compra herramientas de corte y precisión — lote trimestral',
    observations: 'Abono inicial. Saldo pagadero en 30 días.',
    totalAmount: 850_000,
    dueDate: daysFromNow(15),
    supplierId: supplierMetales?.id,
    createdAt: daysAgo(20),
    payments: [
      { amount: 400_000, method: 'TRANSFER', reference: 'TRF-2026-00502', date: daysAgo(15) },
    ],
  });

  // 12. Combustible vehículo — PENDING
  await createAP({
    apNumber: 'CP-2026-0012',
    expenseTypeId: etOperativos.id,
    expenseSubcategoryId: scCombustible!.id,
    status: 'PENDING',
    description: 'Recarga combustible vehículo de reparto — mayo 2026',
    totalAmount: 320_000,
    dueDate: daysFromNow(8),
    createdAt: daysAgo(3),
  });

  // 13. Mantenimiento equipos — OVERDUE — con proveedor
  await createAP({
    apNumber: 'CP-2026-0013',
    expenseTypeId: etOperativos.id,
    expenseSubcategoryId: scMantenimiento!.id,
    status: 'OVERDUE',
    description: 'Mantenimiento preventivo plóter HP Designjet — servicio técnico',
    observations: 'Técnico realizó la visita. Factura vencida sin pagar.',
    totalAmount: 1_200_000,
    dueDate: new Date('2026-02-28'),
    supplierId: supplierTecImpresion?.id,
    createdAt: new Date('2026-02-15'),
  });

  // 14. Insumos limpieza — PAID
  await createAP({
    apNumber: 'CP-2026-0014',
    expenseTypeId: etOperativos.id,
    expenseSubcategoryId: scInsumosInternos!.id,
    status: 'PAID',
    description: 'Insumos limpieza y aseo instalaciones — marzo 2026',
    totalAmount: 195_000,
    dueDate: new Date('2026-03-31'),
    createdAt: new Date('2026-03-20'),
    payments: [
      { amount: 195_000, method: 'CASH', date: new Date('2026-03-28') },
    ],
  });

  // 15. Materiales proyecto impresión gran formato — PAID — plan cuotas 4 cuotas todas pagadas — con proveedor
  await createAP({
    apNumber: 'CP-2026-0015',
    expenseTypeId: etProduccion.id,
    expenseSubcategoryId: scMaterialesCliente!.id,
    status: 'PAID',
    description: 'Compra materiales vinilos y sustratos — proyecto cliente Gran Formato Q1',
    observations: 'Financiado a 4 cuotas por volumen de compra.',
    totalAmount: 4_800_000,
    dueDate: new Date('2026-04-30'),
    supplierId: supplierTintas?.id,
    createdAt: new Date('2026-01-10'),
    payments: [
      { amount: 1_200_000, method: 'TRANSFER', reference: 'TRF-2026-00115', date: new Date('2026-01-31') },
      { amount: 1_200_000, method: 'TRANSFER', reference: 'TRF-2026-00225', date: new Date('2026-02-28') },
      { amount: 1_200_000, method: 'TRANSFER', reference: 'TRF-2026-00330', date: new Date('2026-03-31') },
      { amount: 1_200_000, method: 'TRANSFER', reference: 'TRF-2026-00440', date: new Date('2026-04-30') },
    ],
    installments: [
      { amount: 1_200_000, dueDate: new Date('2026-01-31'), isPaid: true, paidAt: new Date('2026-01-31') },
      { amount: 1_200_000, dueDate: new Date('2026-02-28'), isPaid: true, paidAt: new Date('2026-02-28') },
      { amount: 1_200_000, dueDate: new Date('2026-03-31'), isPaid: true, paidAt: new Date('2026-03-31') },
      { amount: 1_200_000, dueDate: new Date('2026-04-30'), isPaid: true, paidAt: new Date('2026-04-30') },
    ],
  });

  // 16. Diseño subcontratado — PARTIAL — con proveedor
  await createAP({
    apNumber: 'CP-2026-0016',
    expenseTypeId: etProduccion.id,
    expenseSubcategoryId: scSubcontratados!.id,
    status: 'PARTIAL',
    description: 'Servicio diseño gráfico subcontratado — campaña publicitaria cliente corporativo',
    observations: 'Anticipo del 50% pagado. Saldo al entregar artes finales.',
    totalAmount: 2_200_000,
    dueDate: daysFromNow(20),
    supplierId: supplierVinilos?.id,
    createdAt: daysAgo(30),
    payments: [
      { amount: 1_100_000, method: 'TRANSFER', reference: 'TRF-2026-00488', date: daysAgo(25) },
    ],
  });

  // 17. Tintas Epson — PENDING — con proveedor
  await createAP({
    apNumber: 'CP-2026-0017',
    expenseTypeId: etProduccion.id,
    expenseSubcategoryId: scTintas!.id,
    status: 'PENDING',
    description: 'Compra tintas Epson UltraChrome — set completo 8 colores x 2',
    totalAmount: 1_650_000,
    dueDate: daysFromNow(19),
    supplierId: supplierSuministros?.id,
    createdAt: daysAgo(11),
  });

  // 18. Insumos plóter — OVERDUE — con proveedor
  await createAP({
    apNumber: 'CP-2026-0018',
    expenseTypeId: etProduccion.id,
    expenseSubcategoryId: scInsumosProduccion!.id,
    status: 'OVERDUE',
    description: 'Insumos para plóter de corte — cuchillas y bases de corte',
    observations: 'Factura vencida. Proveedor envió segundo aviso de cobro.',
    totalAmount: 980_000,
    dueDate: new Date('2026-02-15'),
    supplierId: supplierTintas?.id,
    createdAt: new Date('2026-02-01'),
  });

  // 19. Anticipo empleado — PAID — efectivo
  await createAP({
    apNumber: 'CP-2026-0019',
    expenseTypeId: etPersonal.id,
    expenseSubcategoryId: scAnticipos!.id,
    status: 'PAID',
    description: 'Anticipo de nómina — empleado Carlos Mendoza',
    observations: 'Descontado de liquidación de nómina siguiente quincena.',
    totalAmount: 500_000,
    dueDate: new Date('2026-03-15'),
    createdAt: new Date('2026-03-10'),
    payments: [
      { amount: 500_000, method: 'CASH', date: new Date('2026-03-10') },
    ],
  });

  // 20. Viáticos viaje Medellín — PENDING
  await createAP({
    apNumber: 'CP-2026-0020',
    expenseTypeId: etPersonal.id,
    expenseSubcategoryId: scViaticos!.id,
    status: 'PENDING',
    description: 'Viáticos viaje comercial Medellín — visita clientes zona cafetera',
    observations: 'Tiquetes + hotel + alimentación 2 noches.',
    totalAmount: 750_000,
    dueDate: daysFromNow(6),
    createdAt: daysAgo(4),
  });

  // 21. Capacitación diseño gráfico — PARTIAL — plan cuotas 2 cuotas, 1 pagada
  await createAP({
    apNumber: 'CP-2026-0021',
    expenseTypeId: etPersonal.id,
    expenseSubcategoryId: scCapacitacion!.id,
    status: 'PARTIAL',
    description: 'Capacitación Adobe Illustrator avanzado — equipo de diseño (3 personas)',
    observations: 'Programa de 8 semanas. Pago en 2 cuotas.',
    totalAmount: 1_400_000,
    dueDate: monthsFromNow(1),
    createdAt: daysAgo(45),
    payments: [
      { amount: 700_000, method: 'TRANSFER', reference: 'TRF-2026-00460', date: daysAgo(40) },
    ],
    installments: [
      { amount: 700_000, dueDate: daysAgo(40), isPaid: true, paidAt: daysAgo(40) },
      { amount: 700_000, dueDate: monthsFromNow(1), isPaid: false },
    ],
  });

  // 22. Gastos notaría — OVERDUE
  await createAP({
    apNumber: 'CP-2026-0022',
    expenseTypeId: etAdministrativos.id,
    expenseSubcategoryId: scNotaria!.id,
    status: 'OVERDUE',
    description: 'Gastos notaría — elevación a escritura pública contrato de arrendamiento',
    observations: 'Vencida. Notaría enviará cobro adicional por demora.',
    totalAmount: 620_000,
    dueDate: new Date('2026-02-20'),
    createdAt: new Date('2026-02-10'),
  });

  // 23. Mensajería y envíos — PENDING
  await createAP({
    apNumber: 'CP-2026-0023',
    expenseTypeId: etOperativos.id,
    expenseSubcategoryId: scMensajeria!.id,
    status: 'PENDING',
    description: 'Mensajería y envíos nacionales — abril 2026',
    observations: 'Cuenta consolidada de envíos del mes.',
    totalAmount: 180_000,
    dueDate: daysFromNow(3),
    createdAt: daysAgo(1),
  });

  // 24. Instalación subcontratada — CANCELLED
  await createAP({
    apNumber: 'CP-2026-0024',
    expenseTypeId: etProduccion.id,
    expenseSubcategoryId: scCostosDirectos!.id,
    status: 'CANCELLED',
    description: 'Servicio instalación vallas publicitarias — proyecto Zona Rosa Bogotá',
    observations: 'Cancelado por desistimiento del cliente final antes de inicio de obra.',
    totalAmount: 3_000_000,
    dueDate: new Date('2026-03-15'),
    supplierId: supplierAcrilicos?.id,
    createdAt: new Date('2026-03-01'),
    cancelReason: 'Cliente canceló el proyecto. No se ejecutó ningún servicio.',
  });

  // 25. Arriendo mes anterior — OVERDUE — recurrente
  await createAP({
    apNumber: 'CP-2026-0025',
    expenseTypeId: etRecurrentes.id,
    expenseSubcategoryId: scArriendo!.id,
    status: 'OVERDUE',
    description: 'Arriendo local comercial — marzo 2026',
    observations: 'Vencida. Arrendador notificó por escrito con cargo por mora del 2%.',
    totalAmount: 2_500_000,
    dueDate: new Date('2026-03-01'),
    isRecurring: true,
    recurringDay: 1,
    supplierId: supplierMaderas?.id,
    createdAt: new Date('2026-02-24'),
  });

  console.log('\n✅ 25 accounts payable records seeded successfully!\n');
  console.log('  Statuses summary:');
  console.log('    PAID     → AP-0001, 0002, 0006, 0010, 0014, 0015, 0019');
  console.log('    PARTIAL  → AP-0003, 0007, 0011, 0016, 0021');
  console.log('    PENDING  → AP-0004, 0005, 0008, 0012, 0017, 0020, 0023');
  console.log('    OVERDUE  → AP-0009, 0013, 0018, 0022, 0025');
  console.log('    CANCELLED→ AP-0024');
}

main()
  .catch((e) => {
    console.error('❌ Seed accounts payable failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
