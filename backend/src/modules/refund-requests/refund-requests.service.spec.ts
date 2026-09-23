import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RefundRequestsService } from './refund-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WsEventsGateway } from '../ws-events/ws-events.gateway';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { ApprovalRequestRegistry } from '../whatsapp/approval-request-registry';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../database/prisma.service.mock';
import { EditRequestStatus, OrderStatus } from '../../generated/prisma';

describe('RefundRequestsService', () => {
  let service: RefundRequestsService;
  let prisma: MockPrismaService;
  let notifications: { notifyUsersWithPermission: jest.Mock; create: jest.Mock };
  let whatsapp: { sendApprovalNotification: jest.Mock; getPhonesByPermission: jest.Mock };
  let wsGateway: {
    emitApprovalCreated: jest.Mock;
    emitApprovalUpdated: jest.Mock;
  };
  let consecutives: { generateNumber: jest.Mock };
  let registry: { register: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();

    notifications = {
      notifyUsersWithPermission: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
    };
    whatsapp = {
      sendApprovalNotification: jest.fn().mockResolvedValue(undefined),
      getPhonesByPermission: jest.fn().mockResolvedValue(['573212016229']),
    };
    wsGateway = {
      emitApprovalCreated: jest.fn(),
      emitApprovalUpdated: jest.fn(),
    };
    consecutives = {
      generateNumber: jest.fn().mockResolvedValue('CR-0001'),
    };
    registry = { register: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: ApprovalRequestRegistry, useValue: registry },
        { provide: WhatsappService, useValue: whatsapp },
        { provide: WsEventsGateway, useValue: wsGateway },
        { provide: ConsecutivesService, useValue: consecutives },
      ],
    }).compile();

    service = module.get<RefundRequestsService>(RefundRequestsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('registers REFUND_REQUEST with approval registry', () => {
      service.onModuleInit();
      expect(registry.register).toHaveBeenCalledWith('REFUND_REQUEST', service);
    });
  });

  describe('create', () => {
    const userId = 'user-1';
    const orderId = 'order-1';
    const baseDto = {
      orderId,
      refundAmount: 100,
      paymentMethod: 'CASH' as const,
      observation: 'Cliente pagó de más',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        firstName: 'Ana',
        lastName: 'Pérez',
        email: 'ana@test.com',
      });
      prisma.user.findMany.mockResolvedValue([]);
    });

    it('throws NotFoundException if order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.create(userId, baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    // El descuento por nómina no entra por caja: se le resta al empleado de su
    // quincena. Pagar la devolución en efectivo sacaría del cajón una plata que
    // nunca llegó; lo que corresponde es reversar el descuento.
    it('rechaza devolver en efectivo una OP pagada con descuento por nómina', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        orderNumber: 'OP-001',
        status: 'DELIVERED',
        total: 250000,
        paidAmount: 250000,
        refundedAmount: 0,
        reversedAmount: 0,
        balance: 0,
        payrollDeduction: { id: 'ded-1', status: 'APPLIED' },
      });

      await expect(service.create(userId, baseDto)).rejects.toThrow(
        /Cancélalo desde Nómina › Descuento de Órdenes/,
      );
    });

    it('rechaza la devolución si el descuento aún no se ha aplicado', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        orderNumber: 'OP-001',
        status: 'CONFIRMED',
        total: 250000,
        paidAmount: 0,
        refundedAmount: 0,
        reversedAmount: 0,
        balance: 250000,
        payrollDeduction: { id: 'ded-1', status: 'PENDING' },
      });

      await expect(service.create(userId, baseDto)).rejects.toThrow(
        /todavía no se ha cobrado nada/,
      );
    });

    // Un descuento rechazado significa que la OP se cobró por otro medio, así
    // que la devolución vuelve a ser un asunto de caja como cualquier otra.
    it('permite la devolución si el descuento fue rechazado', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        orderNumber: 'OP-001',
        status: 'DELIVERED',
        total: 250000,
        paidAmount: 250000,
        refundedAmount: 0,
        reversedAmount: 0,
        balance: 0,
        payrollDeduction: { id: 'ded-1', status: 'REJECTED' },
      });
      prisma.refundRequest.findFirst.mockResolvedValue(null);

      // Sigue de largo hasta las validaciones normales de saldo: lo que importa
      // es que el descuento rechazado NO la frene.
      await expect(service.create(userId, baseDto)).rejects.toThrow(
        /no tiene saldo a favor/,
      );
    });

    it('throws ConflictException if there is an existing PENDING request', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        orderNumber: 'OP-1',
        total: '500',
        paidAmount: '700',
        balance: '-200',
      });
      prisma.refundRequest.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(userId, baseDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws BadRequestException if no overpayment exists', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        orderNumber: 'OP-1',
        total: '500',
        paidAmount: '500',
        balance: '0',
      });
      prisma.refundRequest.findFirst.mockResolvedValue(null);

      await expect(service.create(userId, baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if refund amount exceeds overpayment', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        orderNumber: 'OP-1',
        total: '500',
        paidAmount: '550',
        balance: '-50',
      });
      prisma.refundRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.create(userId, { ...baseDto, refundAmount: 200 }),
      ).rejects.toThrow(BadRequestException);
    });

    // Anular deja lo pagado (menos lo retenido) como saldo a favor; el cliente
    // puede pedir que se lo devuelvan.
    describe('orden anulada', () => {
      // OP de 500 pagada completa y anulada sin retención: toda la venta anulada.
      const anulada = () => ({
        id: orderId,
        orderNumber: 'OP-1',
        status: OrderStatus.ANULADO,
        total: '500',
        paidAmount: '500',
        appliedCreditAmount: '0',
        reversedAmount: '500',
        balance: '-500',
      });

      it('admite devolver su saldo a favor', async () => {
        prisma.order.findUnique.mockResolvedValue(anulada());
        prisma.refundRequest.findFirst.mockResolvedValue(null);
        prisma.refundRequest.create.mockResolvedValue({
          id: 'req-1',
          orderId,
          status: EditRequestStatus.PENDING,
          order: { orderNumber: 'OP-1' },
        });

        await service.create(userId, { ...baseDto, refundAmount: 500 });

        expect(prisma.refundRequest.create).toHaveBeenCalled();
      });

      it('no admite anular más venta: ya se anuló con la orden', async () => {
        prisma.order.findUnique.mockResolvedValue(anulada());

        await expect(
          service.create(userId, { ...baseDto, reversedAmount: 100 }),
        ).rejects.toThrow(/solo se puede devolver el saldo a favor/);
        expect(prisma.refundRequest.create).not.toHaveBeenCalled();
      });
    });

    it('creates PENDING request and notifies reviewers', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        orderNumber: 'OP-1',
        total: '500',
        paidAmount: '700',
        balance: '-200',
      });
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      prisma.refundRequest.create.mockResolvedValue({
        id: 'req-1',
        orderId,
        status: EditRequestStatus.PENDING,
        order: { orderNumber: 'OP-1' },
      });

      const result = await service.create(userId, baseDto);

      expect(prisma.refundRequest.create).toHaveBeenCalled();
      expect(notifications.notifyUsersWithPermission).toHaveBeenCalledWith(
        'approve_refunds',
        expect.objectContaining({
          type: 'REFUND_REQUEST_PENDING',
        }),
      );
      expect(wsGateway.emitApprovalCreated).toHaveBeenCalled();
      expect(result.id).toBe('req-1');
    });

    // El `findFirst` de arriba es un check-then-act: dos peticiones concurrentes
    // lo pasan las dos. Quien cierra la carrera es el índice parcial
    // `refund_requests_pending_unique`, y la petición perdedora llega acá con
    // P2002.
    describe('cuando dos peticiones concurrentes pasan la validación', () => {
      const twin = {
        id: 'req-gemela',
        orderId,
        status: EditRequestStatus.PENDING,
        order: { orderNumber: 'OP-1' },
      };

      // Forma real del error con el adaptador `PrismaPg`: `meta.target` viene
      // vacío y el nombre del índice va en `meta.driverAdapterError`.
      const uniqueViolation = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { fields: ['order_id'] },
              originalMessage:
                'duplicate key value violates unique constraint "refund_requests_pending_unique"',
            },
          },
        },
      });

      beforeEach(() => {
        prisma.order.findUnique.mockResolvedValue({
          id: orderId,
          orderNumber: 'OP-1',
          total: '500',
          paidAmount: '700',
          balance: '-200',
        });
        prisma.refundRequest.create.mockRejectedValue(uniqueViolation);
      });

      it('devuelve la solicitud gemela en lugar de fallar', async () => {
        prisma.refundRequest.findFirst
          .mockResolvedValueOnce(null) // validación previa
          .mockResolvedValueOnce(twin); // búsqueda de la gemela tras el P2002

        await expect(service.create(userId, baseDto)).resolves.toEqual(twin);
      });

      it('no manda una segunda notificación', async () => {
        prisma.refundRequest.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(twin);

        await service.create(userId, baseDto);

        expect(notifications.notifyUsersWithPermission).not.toHaveBeenCalled();
        expect(wsGateway.emitApprovalCreated).not.toHaveBeenCalled();
      });

      it('propaga el error si la gemela no aparece', async () => {
        prisma.refundRequest.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);

        await expect(service.create(userId, baseDto)).rejects.toThrow(
          uniqueViolation,
        );
      });

      it('propaga cualquier otro P2002 que no sea el del índice de pendientes', async () => {
        prisma.refundRequest.findFirst.mockResolvedValue(null);
        const otraViolacion = Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
          meta: {
            driverAdapterError: {
              cause: {
                constraint: { fields: ['cash_movement_id'] },
                originalMessage:
                  'duplicate key value violates unique constraint "refund_requests_cash_movement_id_key"',
              },
            },
          },
        });
        prisma.refundRequest.create.mockRejectedValue(otraViolacion);

        await expect(service.create(userId, baseDto)).rejects.toThrow(
          otraViolacion,
        );
      });
    });
  });

  /**
   * OP de 500 con 700 abonados: 200 de saldo a favor, que es el escenario
   * histórico del módulo. Los overrides sirven para armar los demás.
   */
  const orden = (overrides: Record<string, unknown> = {}) => ({
    id: 'o1',
    orderNumber: 'OP-1',
    status: OrderStatus.DELIVERED,
    subtotal: '500',
    discountAmount: '0',
    total: '500',
    paidAmount: '700',
    appliedCreditAmount: '0',
    refundedAmount: '0',
    reversedAmount: '0',
    reversedNetAmount: '0',
    balance: '-200',
    ...overrides,
  });

  const solicitud = (overrides: Record<string, unknown> = {}) => ({
    id: 'req-1',
    orderId: 'o1',
    requestedById: 'u1',
    refundAmount: '100',
    reversedAmount: '0',
    paymentMethod: 'CASH',
    observation: 'cliente pagó de más',
    executedAt: null,
    order: orden(),
    ...overrides,
  });

  const pendiente = solicitud;
  const aprobada = (overrides: Record<string, unknown> = {}) =>
    solicitud({ status: EditRequestStatus.APPROVED, ...overrides });

  const revisorConPermiso = () => ({
    role: { permissions: [{ permission: { name: 'approve_refunds' } }] },
  });

  describe('approve', () => {
    const reviewerId = 'reviewer-1';
    const requestId = 'req-1';

    beforeEach(() => {
      prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    });

    it('throws NotFoundException if request not found or not pending', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.approve(requestId, reviewerId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if reviewer lacks permission', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue({
        id: requestId,
        orderId: 'o1',
        requestedById: 'u1',
        refundAmount: '100',
        paymentMethod: 'CASH',
        observation: 'x',
        order: {
          id: 'o1',
          orderNumber: 'OP-1',
          total: '500',
          paidAmount: '700',
          balance: '-200',
        },
      });
      prisma.user.findUnique.mockResolvedValue({
        role: { permissions: [] },
      });

      await expect(
        service.approve(requestId, reviewerId, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('autoriza sin exigir sesión de caja abierta', async () => {
      // Gerencia aprueba desde WhatsApp a cualquier hora: si la autorización
      // exigiera caja abierta, de noche fallaría.
      prisma.refundRequest.findFirst.mockResolvedValue(pendiente());
      prisma.user.findUnique.mockResolvedValue(revisorConPermiso());
      prisma.cashSession.findMany.mockResolvedValue([]);
      prisma.refundRequest.update.mockResolvedValue({
        id: requestId,
        status: EditRequestStatus.APPROVED,
        orderId: 'o1',
      });

      const result = await service.approve(requestId, reviewerId, {
        reviewNotes: 'OK',
      });

      expect(result.status).toBe(EditRequestStatus.APPROVED);
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('autorizar no mueve un peso: eso lo hace Caja al ejecutar', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(pendiente());
      prisma.user.findUnique.mockResolvedValue(revisorConPermiso());
      prisma.refundRequest.update.mockResolvedValue({
        id: requestId,
        status: EditRequestStatus.APPROVED,
        orderId: 'o1',
      });

      await service.approve(requestId, reviewerId, {});

      expect(prisma.refundRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId },
          data: expect.objectContaining({
            status: EditRequestStatus.APPROVED,
            reviewedById: reviewerId,
          }),
        }),
      );
      // Ni consecutivo de recibo, ni egreso, ni cambio en la orden.
      expect(consecutives.generateNumber).not.toHaveBeenCalled();
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(wsGateway.emitApprovalUpdated).toHaveBeenCalled();
    });

    it('avisa a Caja que hay una devolución esperando pago', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(pendiente());
      prisma.user.findUnique.mockResolvedValue(revisorConPermiso());
      prisma.refundRequest.update.mockResolvedValue({
        id: requestId,
        status: EditRequestStatus.APPROVED,
        orderId: 'o1',
      });

      await service.approve(requestId, reviewerId, {});

      expect(notifications.notifyUsersWithPermission).toHaveBeenCalledWith(
        'execute_refunds',
        expect.objectContaining({ relatedType: 'RefundRequest' }),
      );
    });

    it('rechaza la autorización si la orden ya no respalda el monto', async () => {
      // Entre la solicitud y la aprobación entró otro pago que consumió el saldo.
      prisma.refundRequest.findFirst.mockResolvedValue(
        pendiente({ order: orden({ paidAmount: '500', balance: '0' }) }),
      );
      prisma.user.findUnique.mockResolvedValue(revisorConPermiso());

      await expect(service.approve(requestId, reviewerId, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('execute', () => {
    const executorId = 'cajero-1';
    const requestId = 'req-1';

    beforeEach(() => {
      prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
      prisma.cashSession.findMany.mockResolvedValue([{ id: 'session-1', cashRegisterId: 'cr-1' }]);
      prisma.cashMovement.create.mockResolvedValue({ id: 'mov-1' });
      prisma.order.update.mockResolvedValue({});
      prisma.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.refundRequest.update.mockResolvedValue({
        id: requestId,
        status: EditRequestStatus.APPROVED,
        orderId: 'o1',
      });
      // La devolución relee la OP dentro de la transacción, ya bloqueada. Por
      // defecto devuelve la misma orden que trae la solicitud de cada prueba.
      prisma.order.findUnique.mockImplementation(async () => {
        const request = await prisma.refundRequest.findFirst
          .getMockImplementation()
          ?.();
        return request?.order ?? null;
      });
    });

    // Un abono que entra entre la lectura de la solicitud y el pago de la
    // devolución quedaba registrado en caja pero borrado del saldo de la OP.
    describe('concurrencia con otros movimientos de la OP', () => {
      it('bloquea la OP antes de releerla', async () => {
        prisma.refundRequest.findFirst.mockResolvedValue(aprobada());

        await service.execute(requestId, executorId);

        const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
        const readOrder = prisma.order.findUnique.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(readOrder);
        expect(prisma.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
      });

      it('calcula sobre la OP releída, no sobre la lectura de la solicitud', async () => {
        // Al leer la solicitud la OP tenía 700 pagados; mientras tanto entró
        // un abono de 50.
        prisma.refundRequest.findFirst.mockResolvedValue(
          aprobada({ refundAmount: '200' }),
        );
        prisma.order.findUnique.mockResolvedValue(orden({ paidAmount: '750' }));

        await service.execute(requestId, executorId);

        const { data } = prisma.order.update.mock.calls[0][0];
        // 750 - 200, no 700 - 200: el abono no se pierde.
        expect(Number(data.paidAmount.toString())).toBe(550);
      });

      it('vuelve a validar contra la OP releída', async () => {
        // La solicitud anulaba parte de la venta y mientras tanto anularon la
        // OP: esa parte ya se anuló con la orden.
        prisma.refundRequest.findFirst.mockResolvedValue(
          aprobada({ reversedAmount: '200' }),
        );
        prisma.order.findUnique.mockResolvedValue(
          orden({ status: OrderStatus.ANULADO }),
        );

        await expect(service.execute(requestId, executorId)).rejects.toThrow(
          BadRequestException,
        );
        expect(prisma.cashMovement.create).not.toHaveBeenCalled();
        expect(prisma.order.update).not.toHaveBeenCalled();
      });
    });

    it('exige sesión de caja abierta', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(aprobada());
      prisma.cashSession.findMany.mockResolvedValue([]);

      await expect(service.execute(requestId, executorId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('crea el egreso y registra quién pagó', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(aprobada());

      await service.execute(requestId, executorId);

      expect(consecutives.generateNumber).toHaveBeenCalledWith('CASH_RECEIPT');
      expect(prisma.cashMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cashSessionId: 'session-1',
            movementType: 'EXPENSE',
            referenceType: 'REFUND',
            referenceId: requestId,
            performedById: executorId,
          }),
        }),
      );
    });

    it('registra el monto devuelto en refundedAmount para que sobreviva a un recálculo', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({ refundAmount: '200' }),
      );

      await service.execute(requestId, executorId);

      const { data } = prisma.order.update.mock.calls[0][0];
      expect(Number(data.paidAmount.toString())).toBe(500);
      expect(Number(data.refundedAmount.toString())).toBe(200);
      expect(Number(data.balance.toString())).toBe(0);
    });

    it('acumula sobre devoluciones previas de la misma orden', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({
          refundAmount: '100',
          order: orden({ paidAmount: '650', refundedAmount: '50' }),
        }),
      );

      await service.execute(requestId, executorId);

      const { data } = prisma.order.update.mock.calls[0][0];
      expect(Number(data.refundedAmount.toString())).toBe(150);
    });

    it('una devolución de saldo a favor no toca el valor de la venta', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(aprobada());

      await service.execute(requestId, executorId);

      const { data } = prisma.order.update.mock.calls[0][0];
      expect(Number(data.reversedAmount.toString())).toBe(0);
      expect(data.status).toBeUndefined();
    });

    it('la reversión parcial anula venta pero conserva el estado de la orden', async () => {
      // OP de 500 entregada, pagada completa. Se anulan 200 y salen 200.
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({
          refundAmount: '200',
          reversedAmount: '200',
          order: orden({ paidAmount: '500', balance: '0' }),
        }),
      );

      await service.execute(requestId, executorId);

      const { data } = prisma.order.update.mock.calls[0][0];
      expect(Number(data.reversedAmount.toString())).toBe(200);
      expect(Number(data.paidAmount.toString())).toBe(300);
      expect(Number(data.balance.toString())).toBe(0);
      // Sigue entregada: la entrega ocurrió sobre la parte buena del trabajo.
      expect(data.status).toBeUndefined();
    });

    it('anular la venta completa pasa la OP a Devolución de dinero', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({
          refundAmount: '500',
          reversedAmount: '500',
          order: orden({ paidAmount: '500', balance: '0' }),
        }),
      );

      await service.execute(requestId, executorId);

      const { data } = prisma.order.update.mock.calls[0][0];
      expect(data.status).toBe(OrderStatus.RETURNED);
      expect(Number(data.balance.toString())).toBe(0);
    });

    // Su venta ya figura anulada entera: sin este cuidado, pagarle el saldo a
    // favor la sacaba de «Anulada» y la pasaba a «Devolución de dinero».
    it('devolver el saldo de una OP anulada no le cambia el estado', async () => {
      const ordenAnulada = orden({
        status: OrderStatus.ANULADO,
        paidAmount: '500',
        reversedAmount: '500',
        balance: '-500',
      });
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({ refundAmount: '500', order: ordenAnulada }),
      );
      prisma.order.findUnique.mockResolvedValue(ordenAnulada);

      await service.execute(requestId, executorId);

      const { data } = prisma.order.update.mock.calls[0][0];
      expect(data.status).toBeUndefined();
      expect(Number(data.paidAmount.toString())).toBe(0);
      expect(Number(data.balance.toString())).toBe(0);
    });

    it('el cliente que abonó menos del total no queda debiendo la diferencia', async () => {
      // El caso que motivó todo: OP de 500 con 200 abonados, el trabajo se cae
      // entero. Se le devuelven sus 200 y la OP no queda cobrando los otros 300.
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({
          refundAmount: '200',
          reversedAmount: '500',
          order: orden({ paidAmount: '200', balance: '300' }),
        }),
      );

      await service.execute(requestId, executorId);

      const { data } = prisma.order.update.mock.calls[0][0];
      expect(Number(data.balance.toString())).toBe(0);
      expect(Number(data.paidAmount.toString())).toBe(0);
      expect(data.status).toBe(OrderStatus.RETURNED);
    });

    it('prorratea la anulación a la base comisionable sin IVA', async () => {
      // Total 595 (500 + IVA 19%). Anular la mitad del total anula la mitad de
      // la base: restar los 297,5 directamente le quitaría de más al asesor.
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({
          refundAmount: '297.5',
          reversedAmount: '297.5',
          order: orden({
            subtotal: '500',
            total: '595',
            paidAmount: '595',
            balance: '0',
          }),
        }),
      );

      await service.execute(requestId, executorId);

      const { data } = prisma.order.update.mock.calls[0][0];
      expect(Number(data.reversedNetAmount.toString())).toBe(250);
    });

    it('guarda el comprobante que adjunta Caja aparte del de la solicitud', async () => {
      // Son dos transferencias distintas en el papel: la que documentó quien
      // solicitó y la que acaba de hacer Caja. Una no puede pisar a la otra.
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({ paymentMethod: 'TRANSFER', receiptFileId: 'file-solicitud' }),
      );

      await service.execute(requestId, executorId, {
        receiptFileId: 'file-pago',
      });

      const { data } = prisma.refundRequest.update.mock.calls[0][0];
      expect(data.executionReceiptFileId).toBe('file-pago');
      expect(data.receiptFileId).toBeUndefined();
    });

    it('ignora el comprobante en una devolución en efectivo', async () => {
      // En efectivo el soporte es el recibo de caja que genera la ejecución.
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({ paymentMethod: 'CASH' }),
      );

      await service.execute(requestId, executorId, {
        receiptFileId: 'file-pago',
      });

      const { data } = prisma.refundRequest.update.mock.calls[0][0];
      expect(data.executionReceiptFileId).toBeUndefined();
    });

    it('no paga dos veces si la solicitud ya fue ejecutada', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(
        aprobada({ executedAt: new Date() }),
      );

      await expect(service.execute(requestId, executorId)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    });

    it('si otra petición gana la carrera, no crea un segundo egreso', async () => {
      // Dos cajeros dando clic a la vez: el `findFirst` de arriba las deja pasar
      // a las dos, y es el WHERE del updateMany el que corta la segunda.
      prisma.refundRequest.findFirst.mockResolvedValue(aprobada());
      prisma.refundRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.execute(requestId, executorId)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    const reviewerId = 'reviewer-1';
    const requestId = 'req-1';

    it('throws NotFoundException if request not found or not pending', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.reject(requestId, reviewerId, { reviewNotes: 'No' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects request and notifies requester', async () => {
      prisma.refundRequest.findFirst.mockResolvedValue({
        id: requestId,
        orderId: 'o1',
        requestedById: 'u1',
        order: { id: 'o1', orderNumber: 'OP-1' },
      });
      prisma.user.findUnique.mockResolvedValue({
        role: {
          permissions: [{ permission: { name: 'approve_refunds' } }],
        },
      });
      prisma.refundRequest.update.mockResolvedValue({});
      prisma.refundRequest.findUnique.mockResolvedValue({
        id: requestId,
        status: EditRequestStatus.REJECTED,
      });

      const result = await service.reject(requestId, reviewerId, {
        reviewNotes: 'No aplica',
      });

      expect(prisma.refundRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId },
          data: expect.objectContaining({
            status: EditRequestStatus.REJECTED,
            reviewedById: reviewerId,
            reviewNotes: 'No aplica',
          }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REFUND_REQUEST_REJECTED',
          userId: 'u1',
        }),
      );
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(result?.status).toBe(EditRequestStatus.REJECTED);
    });
  });

  describe('WhatsApp delegates', () => {
    it('approveViaWhatsApp delegates to approve with fixed note', async () => {
      const approveSpy = jest
        .spyOn(service, 'approve')
        .mockResolvedValue({} as any);
      await service.approveViaWhatsApp('req-1', 'rev-1');
      expect(approveSpy).toHaveBeenCalledWith('req-1', 'rev-1', {
        reviewNotes: 'Aprobado vía WhatsApp',
      });
    });

    it('rejectViaWhatsApp delegates to reject with fixed note', async () => {
      const rejectSpy = jest
        .spyOn(service, 'reject')
        .mockResolvedValue({} as any);
      await service.rejectViaWhatsApp('req-1', 'rev-1');
      expect(rejectSpy).toHaveBeenCalledWith('req-1', 'rev-1', {
        reviewNotes: 'Rechazado vía WhatsApp',
      });
    });
  });

  describe('findPendingRequest', () => {
    it('returns null when request not found', async () => {
      prisma.refundRequest.findUnique.mockResolvedValue(null);
      const result = await service.findPendingRequest('missing');
      expect(result).toBeNull();
    });

    it('returns approval info when found', async () => {
      prisma.refundRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: EditRequestStatus.PENDING,
        requestedById: 'u1',
        order: { orderNumber: 'OP-9' },
      });

      const result = await service.findPendingRequest('req-1');
      expect(result).toEqual({
        id: 'req-1',
        status: EditRequestStatus.PENDING,
        requestedById: 'u1',
        displayLabel: 'solicitud de devolución - Orden OP-9',
      });
    });
  });
});
