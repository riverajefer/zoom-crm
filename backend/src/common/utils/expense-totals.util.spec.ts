import { allocateExpenseTotalToItems, computeExpenseTotals } from './expense-totals.util';

describe('computeExpenseTotals', () => {
  it('devuelve el subtotal cuando no hay IVA ni retenciones', () => {
    const totals = computeExpenseTotals(684550, {});

    expect(totals.total).toBe(684550);
    expect(totals.ivaAmount).toBe(0);
  });

  it('suma el IVA y redondea a peso entero', () => {
    // 684.550 * 1,19 = 814.614,50 → el medio peso no se puede pagar.
    const totals = computeExpenseTotals(684550, { applyIva: true, ivaRate: 0.19 });

    expect(totals.total).toBe(814615);
  });

  it('usa 19% cuando aplica IVA sin tasa explícita', () => {
    const totals = computeExpenseTotals(1000000, { applyIva: true });

    expect(totals.ivaAmount).toBe(190000);
    expect(totals.total).toBe(1190000);
  });

  it('resta retefuente y ReteICA sobre el subtotal', () => {
    const totals = computeExpenseTotals(1000000, {
      applyIva: true,
      ivaRate: 0.19,
      retefuenteRate: 0.025,
      reteICARate: 0.00414,
    });

    expect(totals.retefuenteAmount).toBe(25000);
    expect(totals.reteICAAmount).toBe(4140);
    // 1.000.000 - 25.000 - 4.140 + 190.000
    expect(totals.total).toBe(1160860);
  });

  it('resta ReteIVA sobre el IVA, no sobre el subtotal', () => {
    const totals = computeExpenseTotals(1000000, {
      applyIva: true,
      ivaRate: 0.19,
      reteIVARate: 0.15,
    });

    expect(totals.reteIVAAmount).toBe(28500);
    expect(totals.total).toBe(1161500);
  });

  it('ignora ReteIVA cuando la orden no lleva IVA', () => {
    const totals = computeExpenseTotals(1000000, { applyIva: false, reteIVARate: 0.15 });

    expect(totals.reteIVAAmount).toBe(0);
    expect(totals.total).toBe(1000000);
  });

  it('acepta las tasas como Decimal de Prisma (llegan como objeto)', () => {
    const totals = computeExpenseTotals(1000000, {
      applyIva: true,
      ivaRate: { toString: () => '0.19' },
      retefuenteRate: { toString: () => '0.025' },
    });

    expect(totals.total).toBe(1165000);
  });
});

describe('allocateExpenseTotalToItems', () => {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  it('sin IVA ni retenciones devuelve la base de cada ítem', () => {
    expect(allocateExpenseTotalToItems([100000, 50000], {})).toEqual([100000, 50000]);
  });

  it('reparte el total con IVA y la suma cuadra con el de la OG (OG-2026-0782)', () => {
    // Dos ítems de $24.201,50: la OG muestra $57.600 y eso es lo que entrega Caja.
    const shares = allocateExpenseTotalToItems([24201.5, 24201.5], { applyIva: true, ivaRate: 0.19 });

    expect(sum(shares)).toBe(57600);
    expect(shares).toEqual([28800, 28800]);
  });

  it('asigna el residuo del redondeo sin perder ni sobrar pesos', () => {
    const items = [33333.33, 33333.33, 33333.34];
    const rates = { applyIva: true, ivaRate: 0.19, retefuenteRate: 0.025 };
    const shares = allocateExpenseTotalToItems(items, rates);

    expect(sum(shares)).toBe(computeExpenseTotals(sum(items), rates).total);
    shares.forEach((share) => expect(Number.isInteger(share)).toBe(true));
  });

  it('resta las retenciones en proporción a cada ítem', () => {
    const shares = allocateExpenseTotalToItems([1000000, 0], { retefuenteRate: 0.025 });

    expect(shares).toEqual([975000, 0]);
  });

  it('una OG sin base devuelve ceros', () => {
    expect(allocateExpenseTotalToItems([0, 0], { applyIva: true })).toEqual([0, 0]);
  });
});
