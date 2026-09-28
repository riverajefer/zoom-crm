import { ConflictException } from '@nestjs/common';
import { findActiveCashSessionForLocation } from './active-cash-session.util';

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
