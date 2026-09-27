/**
 * Importa en Zoom los catálogos exportados de High con
 * `scripts/export-high-catalog.sh`.
 *
 *   npm run prisma:import:high                   # simulación: reporta y no escribe
 *   npm run prisma:import:high -- --apply        # escribe
 *   npm run prisma:import:high -- --dir=/ruta    # otra carpeta de JSON
 *
 * La base destino es la de DATABASE_URL (variable de entorno, o `backend/.env`
 * si no está definida). El script la imprime antes de empezar.
 *
 * Reglas:
 * - Todo corre en UNA transacción: o entra el catálogo completo o no entra
 *   nada. La simulación ejecuta lo mismo y hace rollback al final, así que su
 *   reporte es exactamente lo que haría `--apply`.
 * - Se compara por clave natural (nombre, o nombre dentro de su padre), nunca
 *   por id. La clave ignora mayúsculas, tildes y espacios sobrantes, de modo
 *   que "Producción", "produccion" y "Producción " son el mismo registro.
 *   Los proveedores usan el criterio de `normalize.util` (el mismo del
 *   detector de duplicados): NIT sin dígito de verificación, NITs de relleno
 *   descartados y nombre sin sufijos societarios.
 * - Los duplicados de High se FUSIONAN en uno solo: sus hijos (subcategorías,
 *   productos, cargos…) quedan bajo el sobreviviente. El sobreviviente es el
 *   primero que aparece en el export (orden de creación en High) y queda
 *   activo si cualquiera de los fusionados lo estaba.
 * - Si el registro ya existía en Zoom solo se completan los campos vacíos;
 *   nunca se sobrescribe lo que Zoom ya tiene. Por eso se puede correr varias
 *   veces sin duplicar nada.
 * - El stock actual de los insumos arranca en 0: es inventario de High.
 */
import {
  PrismaClient, Prisma, PersonType,
  type UnitOfMeasure, type ProductionArea, type Cargo, type CommercialChannel,
  type ExpenseType, type ExpenseSubcategory, type ProductCategory, type SupplyCategory,
  type Product, type Supply, type Supplier,
} from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import 'dotenv/config';
import { docCore, nameCore } from '../src/common/utils/normalize.util';

type Tx = Prisma.TransactionClient;

// =============================================================================
// Argumentos
// =============================================================================

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const DATA_DIR = resolve(
  argv.find((a) => a.startsWith('--dir='))?.slice('--dir='.length) ??
    join(__dirname, 'data', 'high-catalog'),
);

const unknownArgs = argv.filter((a) => a !== '--apply' && !a.startsWith('--dir='));
if (unknownArgs.length) {
  console.error(`Argumentos desconocidos: ${unknownArgs.join(' ')}`);
  process.exit(1);
}

// =============================================================================
// Forma de los JSON (ver scripts/export-high-catalog.sh)
// =============================================================================

type Decimalish = string | null;

interface UnitIn { name: string; abbreviation: string; description: string | null; isActive: boolean }
interface AreaIn { name: string; description: string | null; isActive: boolean }
interface CargoIn { name: string; description: string | null; isActive: boolean; productionAreaName: string }
interface ChannelIn { name: string; description: string | null }
interface SubcategoryIn { name: string; description: string | null; isActive: boolean }
interface ExpenseTypeIn { name: string; description: string | null; isActive: boolean; subcategories: SubcategoryIn[] }
interface CategoryIn { name: string; slug: string; description: string | null; icon: string | null; sortOrder: number; isActive: boolean }
interface ProductIn {
  name: string; slug: string; description: string | null; basePrice: Decimalish;
  priceUnit: string | null; isActive: boolean; categoryName: string;
}
interface SupplyIn {
  name: string; sku: string | null; description: string | null; categoryName: string;
  purchasePrice: Decimalish; purchaseUnitName: string; purchaseUnitAbbreviation: string;
  consumptionUnitName: string; consumptionUnitAbbreviation: string;
  conversionFactor: string; minimumStock: string; isActive: boolean;
}
interface SupplierIn {
  name: string; encargado: string | null; phone: string | null; landlinePhone: string | null;
  address: string | null; email: string | null; personType: string; nit: string | null;
  isActive: boolean; departmentCode: string; departmentName: string; cityName: string;
}

function readData<T>(file: string): T[] | null {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data)) throw new Error(`${file} no es un arreglo JSON`);
  return data as T[];
}

// =============================================================================
// Normalización
// =============================================================================

/** Texto para guardar: Unicode NFC y sin espacios sobrantes. */
function clean(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Igual que `clean`, pero una cadena vacía cuenta como ausente. */
function cleanOpt(s: string | null | undefined): string | null {
  if (s == null) return null;
  const c = clean(s);
  return c === '' ? null : c;
}

/** Clave de comparación: además sin mayúsculas ni tildes. */
function keyOf(s: string): string {
  return clean(s).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

/** Mismo algoritmo que `generateSlug` de los servicios de portafolio. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Reserva un slug libre dentro de `taken`, agregando -2, -3… si hace falta. */
function claimSlug(taken: Set<string>, wanted: string): string {
  const base = slugify(wanted) || 'sin-nombre';
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

// =============================================================================
// Índice por clave natural y reporte
// =============================================================================

interface Named { id: string; name: string }

/**
 * Registros de Zoom (los que ya existían más los creados en esta corrida),
 * buscables por una o varias claves. `touched` guarda los que ya recibieron
 * una fila del export: si otra fila de High cae en uno de ellos, es un
 * duplicado de High. `created` distingue los nacidos en esta corrida, los
 * únicos cuyo `isActive` puede cambiar una fusión.
 */
class Index<T extends Named> {
  private byKey = new Map<string, T>();
  readonly touched = new Set<string>();
  readonly created = new Set<string>();

  constructor(rows: T[], keysOf: (row: T) => string[] = (row) => [keyOf(row.name)]) {
    for (const row of rows) this.add(row, keysOf(row));
  }

  add(row: T, keys: string[]): void {
    for (const k of keys) if (!this.byKey.has(k)) this.byKey.set(k, row);
  }

  find(keys: string[], accept: (row: T) => boolean = () => true): { row: T; key: string } | null {
    for (const key of keys) {
      const row = this.byKey.get(key);
      if (row && accept(row)) return { row, key };
    }
    return null;
  }

  replace(row: T): void {
    for (const [k, v] of this.byKey) if (v.id === row.id) this.byKey.set(k, row);
  }
}

interface Stats { created: number; merged: number; existing: number; filled: number; rejected: number; total: number }

class Section {
  readonly stats: Stats = { created: 0, merged: 0, existing: 0, filled: 0, rejected: 0, total: 0 };

  constructor(readonly title: string) {
    console.log(`\n▸ ${title}`);
  }

  note(msg: string): void {
    console.log(`    ${msg}`);
  }
}

const sections: Section[] = [];

function section(title: string): Section {
  const s = new Section(title);
  sections.push(s);
  return s;
}

/**
 * Crea o fusiona una fila de High contra el índice. `fill` recibe el registro
 * encontrado y devuelve solo los campos que hay que completar (o `{}`).
 */
async function upsertByKey<T extends Named, In>(opts: {
  sec: Section;
  index: Index<T>;
  input: In;
  label: string;
  keys: string[];
  /** Descarta una coincidencia que en realidad es otro registro. */
  accept?: (row: T) => boolean;
  create: () => Promise<T>;
  /** `bornInRun`: el registro lo creó esta corrida (puede reactivarse). */
  fill: (row: T, bornInRun: boolean) => Record<string, unknown>;
  update: (id: string, data: Record<string, unknown>) => Promise<T>;
}): Promise<T> {
  const { sec, index, label, keys } = opts;
  sec.stats.total++;
  const hit = index.find(keys, opts.accept);

  if (!hit) {
    const row = await opts.create();
    index.add(row, keys);
    index.touched.add(row.id);
    index.created.add(row.id);
    sec.stats.created++;
    return row;
  }

  const isHighDuplicate = index.touched.has(hit.row.id);
  index.touched.add(hit.row.id);
  const how = hit.key === keys[0] ? '' : ` (coincide por ${hit.key.split(':')[0]})`;
  if (isHighDuplicate) {
    sec.stats.merged++;
    sec.note(`⤵ duplicado en High: «${label}» se fusiona con «${hit.row.name}»${how}`);
  } else {
    sec.stats.existing++;
    if (how) sec.note(`≈ «${label}» ya existía en Zoom como «${hit.row.name}»${how}`);
  }

  const data = opts.fill(hit.row, index.created.has(hit.row.id));
  if (Object.keys(data).length === 0) return hit.row;

  const row = await opts.update(hit.row.id, data);
  index.replace(row);
  sec.stats.filled++;
  sec.note(`✎ «${hit.row.name}»: se completa ${Object.keys(data).join(', ')}`);
  return row;
}

/** Campos opcionales que están vacíos en Zoom y llenos en High. */
function missing(current: object, incoming: Record<string, unknown>): Record<string, unknown> {
  const cur = current as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v != null && cur[k] == null) out[k] = v;
  }
  return out;
}

/** Un duplicado activo reactiva al sobreviviente; en registros previos de Zoom no se toca. */
function activation(row: { isActive: boolean }, incoming: boolean, bornInRun: boolean) {
  return bornInRun && incoming && !row.isActive ? { isActive: true } : {};
}

function reject(sec: Section, label: string, reason: string): void {
  sec.stats.total++;
  sec.stats.rejected++;
  sec.note(`✗ «${label}» no se importa: ${reason}`);
}

// =============================================================================
// Importación, en orden de dependencias
// =============================================================================

async function importCatalog(tx: Tx): Promise<void> {
  // ---------------------------------------------------------------- Unidades
  const unitRows = await tx.unitOfMeasure.findMany();
  const unitKeys = (u: { name: string; abbreviation: string }) => [
    keyOf(u.name),
    `abreviatura:${clean(u.abbreviation)}`,
  ];
  const units = new Index<UnitOfMeasure>(unitRows, unitKeys);

  const unitsIn = readData<UnitIn>('units-of-measure.json');
  if (unitsIn) {
    const sec = section('Unidades de medida');
    for (const u of unitsIn) {
      const name = clean(u.name);
      const abbreviation = clean(u.abbreviation);
      const description = cleanOpt(u.description);
      await upsertByKey({
        sec, index: units, input: u, label: u.name, keys: unitKeys({ name, abbreviation }),
        create: () => tx.unitOfMeasure.create({ data: { name, abbreviation, description, isActive: u.isActive } }),
        fill: (row, dup) => ({ ...missing(row, { description }), ...activation(row, u.isActive, dup) }),
        update: (id, data) => tx.unitOfMeasure.update({ where: { id }, data }),
      });
    }
  }

  // ------------------------------------------------------ Áreas de producción
  const areas = new Index<ProductionArea>(await tx.productionArea.findMany());

  const areasIn = readData<AreaIn>('production-areas.json');
  if (areasIn) {
    const sec = section('Áreas de producción');
    for (const a of areasIn) {
      const name = clean(a.name);
      const description = cleanOpt(a.description);
      await upsertByKey({
        sec, index: areas, input: a, label: a.name, keys: [keyOf(name)],
        create: () => tx.productionArea.create({ data: { name, description, isActive: a.isActive } }),
        fill: (row, dup) => ({ ...missing(row, { description }), ...activation(row, a.isActive, dup) }),
        update: (id, data) => tx.productionArea.update({ where: { id }, data }),
      });
    }
  }

  // ------------------------------------------------------------------ Cargos
  const cargosIn = readData<CargoIn>('cargos.json');
  if (cargosIn) {
    const sec = section('Cargos');
    const cargos = new Index<Cargo>(await tx.cargo.findMany(), (c) => [`${c.productionAreaId}|${keyOf(c.name)}`]);
    for (const c of cargosIn) {
      const area = areas.find([keyOf(c.productionAreaName)])?.row;
      if (!area) {
        reject(sec, c.name, `el área «${c.productionAreaName}» no existe en Zoom ni en production-areas.json`);
        continue;
      }
      const name = clean(c.name);
      const description = cleanOpt(c.description);
      await upsertByKey({
        sec, index: cargos, input: c, label: `${c.name} (${c.productionAreaName})`,
        keys: [`${area.id}|${keyOf(name)}`],
        create: () => tx.cargo.create({ data: { name, description, isActive: c.isActive, productionAreaId: area.id } }),
        fill: (row, dup) => ({ ...missing(row, { description }), ...activation(row, c.isActive, dup) }),
        update: (id, data) => tx.cargo.update({ where: { id }, data }),
      });
    }
  }

  // --------------------------------------------------------- Canales de venta
  const channelsIn = readData<ChannelIn>('commercial-channels.json');
  if (channelsIn) {
    const sec = section('Canales de venta');
    const channels = new Index<CommercialChannel>(await tx.commercialChannel.findMany());
    for (const ch of channelsIn) {
      const name = clean(ch.name);
      const description = cleanOpt(ch.description);
      await upsertByKey({
        sec, index: channels, input: ch, label: ch.name, keys: [keyOf(name)],
        create: () => tx.commercialChannel.create({ data: { name, description } }),
        fill: (row) => missing(row, { description }),
        update: (id, data) => tx.commercialChannel.update({ where: { id }, data }),
      });
    }
  }

  // ------------------------------------------- Tipos y subcategorías de gasto
  const expenseTypesIn = readData<ExpenseTypeIn>('expense-types.json');
  if (expenseTypesIn) {
    const secTypes = section('Tipos de gasto');
    const types = new Index<ExpenseType>(await tx.expenseType.findMany());
    // Las subcategorías se procesan después de todos los tipos para que las de
    // un tipo duplicado caigan bajo el sobreviviente.
    const pendingSubs: { typeId: string; typeLabel: string; sub: SubcategoryIn }[] = [];
    for (const t of expenseTypesIn) {
      const name = clean(t.name);
      const description = cleanOpt(t.description);
      const type = await upsertByKey({
        sec: secTypes, index: types, input: t, label: t.name, keys: [keyOf(name)],
        create: () => tx.expenseType.create({ data: { name, description, isActive: t.isActive } }),
        fill: (row, dup) => ({ ...missing(row, { description }), ...activation(row, t.isActive, dup) }),
        update: (id, data) => tx.expenseType.update({ where: { id }, data }),
      });
      for (const sub of t.subcategories ?? []) pendingSubs.push({ typeId: type.id, typeLabel: type.name, sub });
    }

    const secSubs = section('Subcategorías de gasto');
    const subs = new Index<ExpenseSubcategory>(await tx.expenseSubcategory.findMany(), (s) => [`${s.expenseTypeId}|${keyOf(s.name)}`]);
    for (const { typeId, typeLabel, sub } of pendingSubs) {
      const name = clean(sub.name);
      const description = cleanOpt(sub.description);
      await upsertByKey({
        sec: secSubs, index: subs, input: sub, label: `${sub.name} (${typeLabel})`,
        keys: [`${typeId}|${keyOf(name)}`],
        create: () => tx.expenseSubcategory.create({ data: { name, description, isActive: sub.isActive, expenseTypeId: typeId } }),
        fill: (row, dup) => ({ ...missing(row, { description }), ...activation(row, sub.isActive, dup) }),
        update: (id, data) => tx.expenseSubcategory.update({ where: { id }, data }),
      });
    }
  }

  // -------------------------------------------- Categorías de producto/insumo
  const productCategories = new Index<ProductCategory>(await tx.productCategory.findMany());
  const productCategorySlugs = new Set((await tx.productCategory.findMany({ select: { slug: true } })).map((c) => c.slug));
  const supplyCategories = new Index<SupplyCategory>(await tx.supplyCategory.findMany());
  const supplyCategorySlugs = new Set((await tx.supplyCategory.findMany({ select: { slug: true } })).map((c) => c.slug));

  const importCategories = async (
    file: string,
    title: string,
    index: Index<Named & { isActive: boolean }>,
    slugs: Set<string>,
    model: Tx['productCategory'] | Tx['supplyCategory'],
  ) => {
    const rows = readData<CategoryIn>(file);
    if (!rows) return;
    const sec = section(title);
    // Ambos delegados tienen la misma forma; el cast evita la unión de firmas.
    const m = model as Tx['productCategory'];
    for (const c of rows) {
      const name = clean(c.name);
      const description = cleanOpt(c.description);
      const icon = cleanOpt(c.icon);
      await upsertByKey({
        sec, index, input: c, label: c.name, keys: [keyOf(name)],
        create: () => {
          const slug = claimSlug(slugs, c.slug || name);
          if (slug !== c.slug) sec.note(`↻ «${name}»: slug «${c.slug}» ocupado, queda «${slug}»`);
          return m.create({ data: { name, slug, description, icon, sortOrder: c.sortOrder ?? 0, isActive: c.isActive } });
        },
        fill: (row, dup) => ({ ...missing(row, { description, icon }), ...activation(row, c.isActive, dup) }),
        update: (id, data) => m.update({ where: { id }, data }),
      });
    }
  };

  await importCategories('product-categories.json', 'Categorías de productos', productCategories, productCategorySlugs, tx.productCategory);
  await importCategories('supply-categories.json', 'Categorías de insumos', supplyCategories, supplyCategorySlugs, tx.supplyCategory);

  // --------------------------------------------------------------- Productos
  const productsIn = readData<ProductIn>('products.json');
  if (productsIn) {
    const sec = section('Productos');
    const existing = await tx.product.findMany();
    const products = new Index<Product>(existing, (p) => [`${p.categoryId}|${keyOf(p.name)}`]);
    const slugs = new Set(existing.map((p) => p.slug));
    for (const p of productsIn) {
      const category = productCategories.find([keyOf(p.categoryName)])?.row;
      if (!category) {
        reject(sec, p.name, `la categoría «${p.categoryName}» no existe`);
        continue;
      }
      const name = clean(p.name);
      const description = cleanOpt(p.description);
      const priceUnit = cleanOpt(p.priceUnit);
      const basePrice = p.basePrice == null ? null : new Prisma.Decimal(p.basePrice);
      await upsertByKey({
        sec, index: products, input: p, label: `${p.name} (${p.categoryName})`,
        keys: [`${category.id}|${keyOf(name)}`],
        create: () => {
          const slug = claimSlug(slugs, p.slug || name);
          if (slug !== p.slug) sec.note(`↻ «${name}»: slug «${p.slug}» ocupado, queda «${slug}»`);
          return tx.product.create({
            data: { name, slug, description, basePrice, priceUnit, isActive: p.isActive, categoryId: category.id },
          });
        },
        fill: (row, dup) => ({ ...missing(row, { description, basePrice, priceUnit }), ...activation(row, p.isActive, dup) }),
        update: (id, data) => tx.product.update({ where: { id }, data }),
      });
    }
  }

  // ----------------------------------------------------------------- Insumos
  const suppliesIn = readData<SupplyIn>('supplies.json');
  if (suppliesIn) {
    const sec = section('Insumos');
    const existing = await tx.supply.findMany();
    const supplies = new Index<Supply>(existing, (s) => [`${s.categoryId}|${keyOf(s.name)}`]);
    const skus = new Set(existing.map((s) => s.sku).filter((s): s is string => s != null));
    const unitFor = (name: string, abbreviation: string) =>
      units.find(unitKeys({ name: clean(name), abbreviation: clean(abbreviation) }))?.row;

    for (const s of suppliesIn) {
      const category = supplyCategories.find([keyOf(s.categoryName)])?.row;
      const purchaseUnit = unitFor(s.purchaseUnitName, s.purchaseUnitAbbreviation);
      const consumptionUnit = unitFor(s.consumptionUnitName, s.consumptionUnitAbbreviation);
      if (!category || !purchaseUnit || !consumptionUnit) {
        const missingParent = !category
          ? `la categoría «${s.categoryName}»`
          : !purchaseUnit
            ? `la unidad de compra «${s.purchaseUnitName}»`
            : `la unidad de consumo «${s.consumptionUnitName}»`;
        reject(sec, s.name, `${missingParent} no existe`);
        continue;
      }
      const name = clean(s.name);
      const description = cleanOpt(s.description);
      const purchasePrice = s.purchasePrice == null ? null : new Prisma.Decimal(s.purchasePrice);
      await upsertByKey({
        sec, index: supplies, input: s, label: `${s.name} (${s.categoryName})`,
        keys: [`${category.id}|${keyOf(name)}`],
        create: () => {
          let sku = cleanOpt(s.sku);
          if (sku && skus.has(sku)) {
            sec.note(`↻ «${name}»: el SKU «${sku}» ya lo usa otro insumo, queda sin SKU`);
            sku = null;
          }
          if (sku) skus.add(sku);
          return tx.supply.create({
            data: {
              name, sku, description, purchasePrice, isActive: s.isActive,
              categoryId: category.id,
              purchaseUnitId: purchaseUnit.id,
              consumptionUnitId: consumptionUnit.id,
              conversionFactor: new Prisma.Decimal(s.conversionFactor ?? '1'),
              minimumStock: new Prisma.Decimal(s.minimumStock ?? '0'),
              currentStock: 0,
            },
          });
        },
        fill: (row, dup) => ({ ...missing(row, { description, purchasePrice }), ...activation(row, s.isActive, dup) }),
        update: (id, data) => tx.supply.update({ where: { id }, data }),
      });
    }
  }

  // ------------------------------------------------------------- Proveedores
  const suppliersIn = readData<SupplierIn>('suppliers.json');
  if (suppliersIn) {
    const sec = section('Proveedores');
    const departments = await tx.department.findMany({ include: { cities: true } });
    const deptByCode = new Map(departments.map((d) => [d.code, d]));
    const deptByName = new Map(departments.map((d) => [keyOf(d.name), d]));

    const existing = await tx.supplier.findMany();
    // Mismo criterio que el detector de duplicados y `POST /suppliers`
    // (normalize.util): el NIT sin dígito de verificación y descartando los de
    // relleno como 1111111111, que en High comparten decenas de proveedores
    // sin relación; el nombre sin sufijos societarios (SAS, LTDA…).
    const nitKey = (nit: string | null) => docCore(nit) || null;
    const supplierKeys = (s: { name: string; nit: string | null }) => {
      const nit = nitKey(s.nit);
      return [...(nit ? [`nit:${nit}`] : []), `nombre:${nameCore(s.name)}`];
    };
    const suppliers = new Index<Supplier>(existing, supplierKeys);
    const emails = new Set(existing.map((s) => s.email?.toLowerCase()).filter((e): e is string => !!e));

    for (const s of suppliersIn) {
      const dept = deptByCode.get(s.departmentCode) ?? deptByName.get(keyOf(s.departmentName));
      const city = dept?.cities.find((c) => keyOf(c.name) === keyOf(s.cityName));
      if (!dept || !city) {
        reject(sec, s.name, `no se encontró ${!dept ? `el departamento «${s.departmentName}»` : `la ciudad «${s.cityName}» en ${dept.name}`}`);
        continue;
      }
      if (!Object.values(PersonType).includes(s.personType as PersonType)) {
        reject(sec, s.name, `tipo de persona desconocido «${s.personType}»`);
        continue;
      }
      const name = clean(s.name);
      const nit = cleanOpt(s.nit);
      const fields = {
        encargado: cleanOpt(s.encargado),
        phone: cleanOpt(s.phone),
        landlinePhone: cleanOpt(s.landlinePhone),
        address: cleanOpt(s.address),
        nit,
      };
      let email = cleanOpt(s.email)?.toLowerCase() ?? null;
      const claimEmail = () => {
        if (email && emails.has(email)) {
          sec.note(`↻ «${name}»: el email «${email}» ya lo usa otro proveedor, se omite`);
          email = null;
        }
        if (email) emails.add(email);
        return email;
      };
      const namesake = suppliers.find([`nombre:${nameCore(name)}`])?.row;
      if (
        namesake && nitKey(nit) && nitKey(namesake.nit) &&
        nitKey(namesake.nit) !== nitKey(nit) && !suppliers.find([`nit:${nitKey(nit)}`])
      ) {
        sec.note(`! «${name}» (NIT ${nit}) se deja aparte: hay otro con ese nombre y NIT ${namesake.nit}. Revísalo a mano`);
      }
      await upsertByKey({
        sec, index: suppliers, input: s, label: s.name, keys: supplierKeys({ name, nit }),
        // Mismo nombre con NIT distinto son dos proveedores, no un duplicado.
        accept: (row) => !nitKey(nit) || !nitKey(row.nit) || nitKey(row.nit) === nitKey(nit),
        create: () =>
          tx.supplier.create({
            data: {
              name, ...fields, email: claimEmail(),
              personType: s.personType as PersonType,
              isActive: s.isActive,
              departmentId: dept.id,
              cityId: city.id,
            },
          }),
        fill: (row, dup) => {
          const data = { ...missing(row, fields), ...activation(row, s.isActive, dup) };
          if (row.email == null && email) {
            const claimed = claimEmail();
            if (claimed) Object.assign(data, { email: claimed });
          }
          return data;
        },
        update: (id, data) => tx.supplier.update({ where: { id }, data }),
      });
    }
  }
}

// =============================================================================
// Main
// =============================================================================

class DryRunRollback extends Error {}

function describeTarget(url: string | undefined): string {
  if (!url) return '(sin DATABASE_URL)';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(DATABASE_URL ilegible)';
  }
}

function printSummary(): void {
  const cols = ['total', 'created', 'merged', 'existing', 'filled', 'rejected'] as const;
  const headers = ['en High', 'nuevos', 'fusionados', 'ya en Zoom', 'completados', 'rechazados'];
  const width = Math.max(...sections.map((s) => s.title.length), 10);
  console.log('\n' + 'Resumen'.padEnd(width) + headers.map((h) => h.padStart(12)).join(''));
  for (const s of sections) {
    console.log(s.title.padEnd(width) + cols.map((c) => String(s.stats[c]).padStart(12)).join(''));
  }
}

async function main() {
  if (!existsSync(DATA_DIR)) {
    console.error(`No existe la carpeta ${DATA_DIR}. Corre primero scripts/export-high-catalog.sh`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  console.log(`\n📥 Catálogos de High → Zoom`);
  console.log(`   Origen:  ${DATA_DIR}`);
  console.log(`   Destino: ${describeTarget(url)}`);
  console.log(`   Modo:    ${APPLY ? 'ESCRIBE (--apply)' : 'simulación — no se escribe nada (usa --apply para escribir)'}`);

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$transaction(
      async (tx) => {
        await importCatalog(tx);
        if (!APPLY) throw new DryRunRollback();
      },
      { maxWait: 30_000, timeout: 10 * 60_000 },
    );
    printSummary();
    console.log('\n✓ Importación aplicada.');
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
    printSummary();
    console.log('\n○ Simulación: se hizo rollback, la base quedó intacta. Repite con --apply para escribir.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✗ Falló la importación; no se escribió nada (la transacción se revirtió).');
  console.error(err);
  process.exit(1);
});
