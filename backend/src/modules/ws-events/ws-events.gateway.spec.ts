import { WsEventsGateway } from './ws-events.gateway';
import { WS_EVENTS } from './ws-events.types';

/**
 * Salas de sede de las aprobaciones (solo Zoom, docs/PLAN_SEDES.md §15.2).
 */
describe('WsEventsGateway — salas por sede', () => {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const prisma: any = {
    order: { findUnique: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
  };
  const jwt: any = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1' }) };
  const config: any = { get: jest.fn(() => 'secret') };
  let gateway: WsEventsGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new WsEventsGateway(jwt, config, prisma);
    (gateway as any).server = { to };
  });

  const flush = () => new Promise((r) => setImmediate(r));

  it('una solicitud con OP va a la sala de su sede y a la de "todas"', async () => {
    prisma.order.findUnique.mockResolvedValue({ locationId: 'l-119' });

    gateway.emitApprovalCreated({ id: 'r1', orderId: 'o1' });
    await flush();

    expect(to).toHaveBeenCalledWith(['approvals:advance_payments:l-119', 'approvals:advance_payments:all']);
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.APPROVAL_REQUEST_CREATED, { id: 'r1', orderId: 'o1' });
  });

  it('sin OP no se sabe la sede y va a la sala general', async () => {
    gateway.emitApprovalUpdated({ id: 'r1', status: 'APPROVED' });
    await flush();

    expect(to).toHaveBeenCalledWith(['approvals:advance_payments']);
  });

  it('al conectarse, caja entra a la sala general y a las de sus sedes', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    prisma.user.findUnique.mockResolvedValue({
      locations: [{ locationId: 'l-104' }],
      role: { permissions: [] },
    });
    const client: any = { id: 'c1', handshake: { auth: { token: 't' } }, data: {}, join: jest.fn(), disconnect: jest.fn() };

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(['approvals:advance_payments', 'approvals:advance_payments:l-104']);
  });

  it('quien ve todas las sedes entra a la sala de "todas"', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    prisma.user.findUnique.mockResolvedValue({ locations: [], role: { permissions: [{ permissionId: 'p' }] } });
    const client: any = { id: 'c1', handshake: { auth: { token: 't' } }, data: {}, join: jest.fn(), disconnect: jest.fn() };

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(['approvals:advance_payments', 'approvals:advance_payments:all']);
  });
});
