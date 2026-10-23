import { ConflictException } from '@nestjs/common';
import {
  assertCashSessionNotCounting,
  assertMovementChangeAllowedDuringCount,
  findActiveCashSessionForLocation,
} from './active-cash-session.util';
import { Prisma } from '../../generated/prisma';

// Solo Zoom (docs/PLAN_SEDES.md §4)
describe('findActiveCashSessionForLocation', () => {
  const client = { cashSession: { findMany: jest.fn() } };

  it('busca la sesión abierta de las cajas de esa sede', async () => {
    client.cashSession.findMany.mockResolvedValue([{ id: 'cs-119', cashRegisterId: 'cr-119' }]);

    await expect(findActiveCashSessionForLocation(client as any, 'l-119')).resolves.toEqual({
      id: 'cs-119',
      cashRegisterId: 'cr-119',
    });
    expect(client.cashSession.findMany.mock.calls[0][0].where).toEqual({
      status: 'OPEN',
      cashRegister: { locationId: 'l-119' },
    });
  });

  it('sin caja abierta en la sede devuelve null, aunque otra sede tenga la suya abierta', async () => {
    client.cashSession.findMany.mockResolvedValue([]);

    await expect(findActiveCashSessionForLocation(client as any, 'l-104')).resolves.toBeNull();
  });

  it('dos cajas abiertas en la misma sede es un conflicto', async () => {
    client.cashSession.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await expect(findActiveCashSessionForLocation(client as any, 'l-125')).rejects.toThrow(ConflictException);
  });
});

describe('assertCashSessionNotCounting', () => {
  const counting = { countStartedAt: new Date('2026-10-23T14:00:00Z') };

  it('bloquea el efectivo mientras Caja cuenta', () => {
    expect(() => assertCashSessionNotCounting(counting, 'CASH')).toThrow(
      ConflictException,
    );
  });

  it('deja pasar lo que no toca el cajón', () => {
    for (const method of ['TRANSFER', 'CARD', 'CREDIT_BALANCE', undefined]) {
      expect(() => assertCashSessionNotCounting(counting, method)).not.toThrow();
    }
  });

  it('deja pasar el efectivo si no hay arqueo o no hay caja', () => {
    expect(() =>
      assertCashSessionNotCounting({ countStartedAt: null }, 'CASH'),
    ).not.toThrow();
    expect(() => assertCashSessionNotCounting(null, 'CASH')).not.toThrow();
  });
});

describe('assertMovementChangeAllowedDuringCount', () => {
  const makeClient = (movement: unknown) => ({
    cashMovement: { findUnique: jest.fn().mockResolvedValue(movement) },
  });
  const cashMovement = (session: Record<string, unknown>) => ({
    amount: new Prisma.Decimal(50000),
    paymentMethod: 'CASH',
    cashSession: { status: 'OPEN', countStartedAt: new Date(), ...session },
  });
  const run = (movement: unknown, next: any) =>
    assertMovementChangeAllowedDuringCount(
      makeClient(movement) as any,
      'mov-1',
      next,
    );

  it('bloquea cambiar el monto de un abono en efectivo durante el arqueo', async () => {
    await expect(
      run(cashMovement({}), {
        amount: new Prisma.Decimal(60000),
        paymentMethod: 'CASH',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('bloquea anular un movimiento en efectivo durante el arqueo', async () => {
    await expect(run(cashMovement({}), null)).rejects.toThrow(ConflictException);
  });

  it('bloquea pasar una transferencia a efectivo durante el arqueo', async () => {
    await expect(
      run(
        { ...cashMovement({}), paymentMethod: 'TRANSFER' },
        { amount: new Prisma.Decimal(50000), paymentMethod: 'CASH' },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('deja pasar el formulario que reenvía el abono sin cambios', async () => {
    await expect(
      run(cashMovement({}), {
        amount: new Prisma.Decimal(50000),
        paymentMethod: 'CASH',
      }),
    ).resolves.toBeUndefined();
  });

  it('deja pasar cambios en una transferencia', async () => {
    await expect(
      run(
        { ...cashMovement({}), paymentMethod: 'TRANSFER' },
        { amount: new Prisma.Decimal(70000), paymentMethod: 'TRANSFER' },
      ),
    ).resolves.toBeUndefined();
  });

  it('no aplica a sesiones sin arqueo ni a sesiones cerradas', async () => {
    await expect(
      run(cashMovement({ countStartedAt: null }), null),
    ).resolves.toBeUndefined();
    await expect(
      run(cashMovement({ status: 'CLOSED' }), null),
    ).resolves.toBeUndefined();
  });
});
