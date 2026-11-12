import { Prisma } from '../../generated/prisma';
import {
  applyColombianRounding,
  computeDtfTotalToCharge,
  normalizeRate,
  roundToWholePeso,
} from './rounding.util';

const dec = (v: string | number) => new Prisma.Decimal(v);

describe('applyColombianRounding', () => {
  it.each([
    ['94350', '94350'], // 5,55 × 17.000: se paga exacto, no se toca
    ['41650', '41650'], // 35.000 + 19 %
    ['94010', '94000'], // 10 → baja
    ['94024', '94000'], // 24 → baja
    ['94025', '94050'], // 25 → sube
    ['94049', '94050'], // 49 → sube
    ['94080', '94100'], // 30 sobre 50 → sube
    ['29988', '30000'],
    ['41600', '41600'], // múltiplo exacto
  ])('redondea %s → %s', (input, expected) => {
    expect(applyColombianRounding(dec(input)).toString()).toBe(expected);
  });

  it('trunca los centavos antes de aplicar la regla', () => {
    expect(applyColombianRounding(dec('164755.50')).toString()).toBe('164750');
    expect(applyColombianRounding(dec('164774.99')).toString()).toBe('164750');
  });
});

describe('roundToWholePeso', () => {
  it('redondea half-up al peso entero', () => {
    expect(roundToWholePeso(dec('41650.50')).toString()).toBe('41651');
    expect(roundToWholePeso(dec('41650.49')).toString()).toBe('41650');
  });
});

describe('computeDtfTotalToCharge', () => {
  it('cobra el mismo total que tendrá la OP cuando aplica IVA', () => {
    // 35.000 + 19% = 41.650, que ya es múltiplo de 50.
    expect(computeDtfTotalToCharge(dec('35000'), true).toString()).toBe('41650');
    // 12.345 + 19% = 14.690,55 → 14.700
    expect(computeDtfTotalToCharge(dec('12345'), true).toString()).toBe('14700');
  });

  it('redondea también cuando no aplica IVA', () => {
    expect(computeDtfTotalToCharge(dec('11880'), false).toString()).toBe('11900');
    expect(computeDtfTotalToCharge(dec('11860'), false).toString()).toBe('11850');
  });

  it('acepta el valor como número o string', () => {
    expect(computeDtfTotalToCharge(45000, true).toString()).toBe('53550');
    expect(computeDtfTotalToCharge('45000', true).toString()).toBe('53550');
  });
});

// ─────────────────────────────────────────────
// normalizeRate
// ─────────────────────────────────────────────
describe('normalizeRate', () => {
  // El caso real: el formulario manda `1.104 / 100`, que en coma flotante es
  // 0.011040000000000001. Guardado tal cual, multiplicaba el subtotal y dejaba
  // totales como 770383.695999999999330 con un saldo de -0.304 imposible de
  // saldar. Son OP-2026-2041, OP-2026-1465 y OP-2026-1907 en producción.
  it('limpia el residuo de dividir un porcentaje entre 100', () => {
    expect(normalizeRate(1.104 / 100).toString()).toBe('0.01104');
    expect(normalizeRate(2.5 / 100).toString()).toBe('0.025');
    expect(normalizeRate(0.414 / 100).toString()).toBe('0.00414');
  });

  it('deja intactas las tasas que ya están limpias', () => {
    expect(normalizeRate(0.19).toString()).toBe('0.19');
    expect(normalizeRate(0.15).toString()).toBe('0.15');
  });

  it('trata la ausencia de tasa como cero', () => {
    expect(normalizeRate(undefined).toString()).toBe('0');
    expect(normalizeRate(null).toString()).toBe('0');
  });

  it('acepta Decimal y cadena', () => {
    expect(normalizeRate(new Prisma.Decimal('0.011040000000000001')).toString()).toBe('0.01104');
    expect(normalizeRate('0.025').toString()).toBe('0.025');
  });

  // Seis decimales sobran para cualquier tasa real; la más fina que usa el
  // cliente es ReteICA a cuatro.
  it('conserva seis decimales', () => {
    expect(normalizeRate(0.0001235).toString()).toBe('0.000124');
  });

  // Lo que de verdad importa: que el total deje de tener cola.
  it('el total de una orden con retenciones ya no arrastra residuo', () => {
    const subtotal = new Prisma.Decimal(667600);

    const sucio = subtotal.mul(new Prisma.Decimal(1.104 / 100));
    const limpio = subtotal.mul(normalizeRate(1.104 / 100));

    expect(sucio.toString()).not.toBe(limpio.toString());
    expect(limpio.toString()).toBe('7370.304');
  });
});
