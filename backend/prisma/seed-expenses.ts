import { PrismaClient } from '../src/generated/prisma';
import { normName } from '../src/common/utils/normalize.util';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('\n💸 Creating expense types and subcategories...');

  const expenseTypesData = [
    {
      name: 'Operativos',
      description: 'Gastos necesarios para el funcionamiento diario',
      subcategories: [
        'Insumos internos',
        'Papelería',
        'Herramientas',
        'Combustible',
        'Alimentación',
        'Mensajería',
        'Mantenimiento',
      ],
    },
    {
      name: 'Producción',
      description: 'Gastos asociados directamente a generar ingresos (requiere OT)',
      subcategories: [
        'Compra de materiales para cliente',
        'Servicios subcontratados',
        'Costos directos de orden de trabajo',
        'Tintas para máquinas',
        'Insumos para máquinas',
      ],
    },
    {
      name: 'Administrativos',
      description: 'Gastos de gestión y soporte',
      subcategories: [
        'Contador',
        'Asesoría legal',
        'Software',
        'Bancos',
        'Comisiones',
        'Notaría',
      ],
    },
    {
      name: 'Personal',
      description: 'Gastos relacionados con empleados',
      subcategories: ['Anticipos', 'Viáticos', 'Reembolsos', 'Capacitación'],
    },
    {
      name: 'Servicios recurrentes',
      description: 'Pagos periódicos',
      subcategories: ['Arriendo', 'Internet', 'Luz / agua', 'Hosting', 'Licencias'],
    },
  ];

  // Se busca por nombre normalizado, no exacto: si alguien renombró
  // «Producción» a «PRODUCCIÓN», un upsert por `name` crearía un segundo tipo
  // (y hoy chocaría contra `expense_types_name_normalized_unique`).
  const existingTypes = await prisma.expenseType.findMany({ select: { id: true, name: true } });

  for (const typeData of expenseTypesData) {
    const existing = existingTypes.find((t) => normName(t.name) === normName(typeData.name));
    const expenseType = existing
      ? await prisma.expenseType.update({
          where: { id: existing.id },
          data: { description: typeData.description },
        })
      : await prisma.expenseType.create({
          data: { name: typeData.name, description: typeData.description },
        });
    console.log(`  ✓ ExpenseType: ${typeData.name}`);

    for (const subcatName of typeData.subcategories) {
      await prisma.expenseSubcategory.upsert({
        where: { name_expenseTypeId: { name: subcatName, expenseTypeId: expenseType.id } },
        update: {},
        create: { name: subcatName, expenseTypeId: expenseType.id },
      });
    }
  }

  console.log('\n✅ Expense types seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });