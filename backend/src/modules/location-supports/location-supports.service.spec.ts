import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocationSupportsService } from './location-supports.service';
import {
  findActiveLocationSupport,
  findOpenCashSessionInLocation,
} from '../../common/utils/location-support.util';

jest.mock('../../common/utils/date-range.util', () => ({
  ...jest.requireActual('../../common/utils/date-range.util'),
  businessToday: () => '2026-10-01',
}));
jest.mock('../../common/utils/location-support.util', () => ({
  ...jest.requireActual('../../common/utils/location-support.util'),
  findActiveLocationSupport: jest.fn(),
  findOpenCashSessionInLocation: jest.fn(),
}));

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const activeSupport = findActiveLocationSupport as jest.Mock;
const openCash = findOpenCashSessionInLocation as jest.Mock;

/** Apoyo en otra sede (solo Zoom, docs/PLAN_SEDES.md §16). */
describe('LocationSupportsService', () => {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    location: { findUnique: jest.fn() },
    locationSupport: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data, ...people })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...stored, ...data })),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const notifications: any = { notifyUsersWithPermission: jest.fn(), create: jest.fn() };
  const ws: any = { emitToUser: jest.fn() };
  const service = new LocationSupportsService(prisma, notifications, ws);

  const people = {
    user: { firstName: 'Ana', lastName: 'Ruiz', username: 'asesor.104' },
    location: { id: 'l-125', name: 'Local 125' },
    reviewedBy: { firstName: 'Oscar', lastName: 'Herrera', username: 'admin.zoom' },
    endedBy: { firstName: 'Oscar', lastName: 'Herrera', username: 'admin.zoom' },
  };
  /** Lo que devuelve `findUnique` con `include`: la solicitud guardada. */
  let stored: any;

  const employee = (overrides: Record<string, unknown> = {}) => ({
    firstName: 'Ana',
    lastName: 'Ruiz',
    username: 'asesor.104',
    isActive: true,
    defaultLocationId: 'l-104',
    locations: [{ locationId: 'l-104' }],
    role: { permissions: [] },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(employee());
    prisma.location.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      name: `Local ${where.id.slice(2)}`,
      isActive: true,
    }));
    prisma.locationSupport.findFirst.mockResolvedValue(null);
    activeSupport.mockResolvedValue(null);
    openCash.mockResolvedValue(null);
  });

  describe('request (el empleado pide)', () => {
    it('sin apoyo vigente: pide trabajar en otra sede hoy y avisa a Gerencia', async () => {
      await service.request('u-ana', { locationId: 'l-125', reason: 'Cubro a Laura' });

      expect(prisma.locationSupport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u-ana',
            locationId: 'l-125',
            kind: 'SUPPORT',
            status: 'PENDING',
            startDate: day('2026-10-01'),
            endDate: day('2026-10-01'),
            requestedById: 'u-ana',
            replacesId: null,
          }),
        }),
      );
      expect(notifications.notifyUsersWithPermission).toHaveBeenCalledWith(
        'authorize_location_support',
        expect.objectContaining({ type: 'LOCATION_SUPPORT_REQUEST_PENDING' }),
      );
    });

    it('a una de sus sedes fijas no hace falta: se cambia desde el selector', async () => {
      await expect(service.request('u-ana', { locationId: 'l-104', reason: 'x' })).rejects.toThrow(/selector/);
      expect(prisma.locationSupport.create).not.toHaveBeenCalled();
    });

    it('no puede empezar en el pasado', async () => {
      await expect(
        service.request('u-ana', { locationId: 'l-125', startDate: '2026-09-30', reason: 'x' }),
      ).rejects.toThrow(/fecha pasada/);
    });

    it('la fecha final no puede ir antes de la inicial', async () => {
      await expect(
        service.request('u-ana', { locationId: 'l-125', startDate: '2026-10-03', endDate: '2026-10-02', reason: 'x' }),
      ).rejects.toThrow(/anterior/);
    });

    it('una sola solicitud pendiente a la vez', async () => {
      prisma.locationSupport.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p1' });

      await expect(service.request('u-ana', { locationId: 'l-125', reason: 'x' })).rejects.toThrow(/pendiente/);
    });

    it('quien opera en todas las sedes no pide apoyos', async () => {
      prisma.user.findUnique.mockResolvedValue(employee({ role: { permissions: [{ permissionId: 'p' }] } }));

      await expect(service.request('u-admin', { locationId: 'l-125', reason: 'x' })).rejects.toThrow(
        BadRequestException,
      );
    });

    describe('con un apoyo vigente (cambio de sede)', () => {
      beforeEach(() => {
        activeSupport.mockResolvedValue({
          id: 's-125',
          locationId: 'l-125',
          endDate: day('2026-10-05'),
          location: { name: 'Local 125' },
        });
      });

      it('a otra sede ajena: reemplaza el apoyo actual, desde hoy y hasta su mismo fin', async () => {
        await service.request('u-ana', { locationId: 'l-119', reason: 'Me necesitan en el 119' });

        expect(prisma.locationSupport.create.mock.calls[0][0].data).toMatchObject({
          locationId: 'l-119',
          kind: 'SUPPORT',
          startDate: day('2026-10-01'),
          endDate: day('2026-10-05'),
          replacesId: 's-125',
        });
      });

      it('a su propia sede: es una vuelta (RETURN), no un apoyo', async () => {
        await service.request('u-ana', { locationId: 'l-104', reason: 'Laura volvió' });

        expect(prisma.locationSupport.create.mock.calls[0][0].data).toMatchObject({
          locationId: 'l-104',
          kind: 'RETURN',
          replacesId: 's-125',
        });
      });

      it('a la misma sede del apoyo no tiene sentido', async () => {
        await expect(service.request('u-ana', { locationId: 'l-125', reason: 'x' })).rejects.toThrow(
          /Ya estás de apoyo/,
        );
      });
    });
  });

  describe('schedule (Gerencia programa)', () => {
    it('nace aprobado, avisa al empleado y le cambia la pantalla en vivo', async () => {
      await service.schedule('u-oscar', {
        userId: 'u-ana',
        locationId: 'l-125',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        reason: 'Vacaciones de Laura',
      });

      expect(prisma.locationSupport.create.mock.calls[0][0].data).toMatchObject({
        status: 'APPROVED',
        requestedById: 'u-oscar',
        reviewedById: 'u-oscar',
        startDate: day('2026-10-01'),
        endDate: day('2026-10-05'),
      });
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-ana', type: 'LOCATION_SUPPORT_SCHEDULED' }),
      );
      expect(ws.emitToUser).toHaveBeenCalledWith('u-ana', 'location_support_changed', { id: 'new' });
    });

    it('no se programa en su propia sede', async () => {
      await expect(
        service.schedule('u-oscar', { userId: 'u-ana', locationId: 'l-104', startDate: '2026-10-01', reason: 'x' }),
      ).rejects.toThrow(/ya es la sede/);
    });

    it('no se cruza con otro apoyo aprobado', async () => {
      prisma.locationSupport.findFirst.mockResolvedValue({
        startDate: day('2026-10-03'),
        endDate: day('2026-10-04'),
        location: { name: 'Local 119' },
      });

      await expect(
        service.schedule('u-oscar', {
          userId: 'u-ana',
          locationId: 'l-125',
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          reason: 'x',
        }),
      ).rejects.toThrow(/Se cruza con el apoyo en Local 119/);
    });
  });

  describe('approve', () => {
    const change = () => ({
      id: 'r1',
      userId: 'u-ana',
      locationId: 'l-104',
      kind: 'RETURN',
      status: 'PENDING',
      startDate: day('2026-10-01'),
      endDate: day('2026-10-01'),
      replacesId: 's-125',
      ...people,
    });

    beforeEach(() => {
      stored = change();
      prisma.locationSupport.findUnique.mockImplementation(async ({ where }: any) =>
        where.id === 's-125'
          ? { id: 's-125', locationId: 'l-125', endedAt: null, location: { name: 'Local 125' } }
          : stored,
      );
    });

    it('con la caja abierta en la sede del apoyo no se aprueba el cambio', async () => {
      openCash.mockResolvedValue({ id: 'cs1', cashRegister: { name: 'Caja Local 125' } });

      await expect(service.approve('u-oscar', 'r1', {})).rejects.toMatchObject({
        response: { code: 'CASH_SESSION_OPEN', message: 'Primero debe cerrar la Caja Local 125 (Local 125)' },
      });
      expect(openCash).toHaveBeenCalledWith(prisma, 'u-ana', 'l-125');
      expect(prisma.locationSupport.update).not.toHaveBeenCalled();
    });

    it('termina el apoyo que reemplaza y aprueba, en la misma transacción', async () => {
      await service.approve('u-oscar', 'r1', { reviewNotes: 'ok' });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.locationSupport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's-125' },
          data: expect.objectContaining({ endedById: 'u-oscar', endReason: 'Cambio de sede aprobado' }),
        }),
      );
      expect(prisma.locationSupport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'u-oscar', reviewNotes: 'ok' }),
        }),
      );
      expect(ws.emitToUser).toHaveBeenCalledWith('u-ana', 'location_support_changed', { id: 'r1' });
    });

    it('una solicitud vieja empieza el día que se aprueba', async () => {
      stored = { ...change(), kind: 'SUPPORT', replacesId: null, startDate: day('2026-09-29'), endDate: day('2026-10-03') };

      await service.approve('u-oscar', 'r1', {});

      expect(prisma.locationSupport.update.mock.calls[0][0].data.startDate).toEqual(day('2026-10-01'));
    });

    it('si sus fechas ya pasaron, no se aprueba', async () => {
      stored = { ...change(), kind: 'SUPPORT', replacesId: null, startDate: day('2026-09-28'), endDate: day('2026-09-30') };

      await expect(service.approve('u-oscar', 'r1', {})).rejects.toThrow(/ya pasaron/);
    });

    it('una ya respondida no se vuelve a aprobar', async () => {
      stored = { ...change(), status: 'APPROVED' };

      await expect(service.approve('u-oscar', 'r1', {})).rejects.toThrow(/ya fue respondida/);
    });
  });

  it('reject avisa al empleado con la nota', async () => {
    stored = { id: 'r1', userId: 'u-ana', status: 'PENDING', ...people };
    prisma.locationSupport.findUnique.mockResolvedValue(stored);

    await service.reject('u-oscar', 'r1', { reviewNotes: 'Hoy no' });

    expect(prisma.locationSupport.update.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED' });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-ana', type: 'LOCATION_SUPPORT_REJECTED', message: expect.stringContaining('Hoy no') }),
    );
  });

  describe('end (Gerencia termina antes de tiempo)', () => {
    const vigente = () => ({
      id: 's-125',
      userId: 'u-ana',
      locationId: 'l-125',
      kind: 'SUPPORT',
      status: 'APPROVED',
      endedAt: null,
      startDate: day('2026-09-30'),
      endDate: day('2026-10-05'),
      ...people,
    });

    it('con la caja abierta en esa sede no se termina', async () => {
      stored = vigente();
      prisma.locationSupport.findUnique.mockResolvedValue(stored);
      activeSupport.mockResolvedValue({ id: 's-125' });
      openCash.mockResolvedValue({ id: 'cs1', cashRegister: { name: 'Caja Local 125' } });

      await expect(service.end('u-oscar', 's-125', { reason: 'Volvió Laura' })).rejects.toMatchObject({
        response: { code: 'CASH_SESSION_OPEN' },
      });
    });

    it('sin caja abierta se termina y el empleado vuelve a su sede', async () => {
      stored = vigente();
      prisma.locationSupport.findUnique.mockResolvedValue(stored);
      activeSupport.mockResolvedValue({ id: 's-125' });

      await service.end('u-oscar', 's-125', { reason: 'Volvió Laura' });

      expect(prisma.locationSupport.update.mock.calls[0][0].data).toMatchObject({
        endedById: 'u-oscar',
        endReason: 'Volvió Laura',
      });
      expect(ws.emitToUser).toHaveBeenCalledWith('u-ana', 'location_support_changed', { id: 's-125' });
    });

    it('uno programado para después se cancela sin mirar la caja', async () => {
      stored = { ...vigente(), startDate: day('2026-10-03') };
      prisma.locationSupport.findUnique.mockResolvedValue(stored);

      await service.end('u-oscar', 's-125', { reason: 'Ya no hace falta' });

      expect(openCash).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Se canceló tu apoyo en otra sede' }),
      );
    });

    it('uno que ya venció no se termina', async () => {
      stored = { ...vigente(), endDate: day('2026-09-30') };
      prisma.locationSupport.findUnique.mockResolvedValue(stored);

      await expect(service.end('u-oscar', 's-125', { reason: 'x' })).rejects.toThrow(/ya terminó/);
    });
  });

  it('cancel: solo el dueño y solo si está pendiente', async () => {
    prisma.locationSupport.findUnique.mockResolvedValue({ id: 'r1', userId: 'u-otro', status: 'PENDING' });
    await expect(service.cancel('u-ana', 'r1')).rejects.toThrow(NotFoundException);

    prisma.locationSupport.findUnique.mockResolvedValue({ id: 'r1', userId: 'u-ana', status: 'APPROVED' });
    await expect(service.cancel('u-ana', 'r1')).rejects.toThrow(/pendiente/);
  });

  it('vigentes: uno vencido solo aparece si sigue con la caja abierta', async () => {
    prisma.locationSupport.findMany.mockResolvedValue([
      { id: 'a', userId: 'u1', locationId: 'l-125', endDate: day('2026-10-02') },
      { id: 'b', userId: 'u2', locationId: 'l-119', endDate: day('2026-09-30') },
      { id: 'c', userId: 'u3', locationId: 'l-104', endDate: day('2026-09-30') },
    ]);
    openCash.mockImplementation(async (_p: unknown, userId: string) => (userId === 'u2' ? { id: 'cs' } : null));

    const rows = await service.findAll({ view: 'active' });

    expect(rows.map((r: any) => [r.id, r.overdue])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });
});
