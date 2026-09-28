// uuid es ESM-only en v9+; se mockea antes de los imports (StorageService lo usa).
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DtfService } from './dtf.service';
import { DtfRepository } from './dtf.repository';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { StorageService } from '../storage/storage.service';
import { OrdersService } from '../orders/orders.service';
import { CreditBalanceService } from '../credit-balance/credit-balance.service';
import { DtfStatus, PaymentMethod, Prisma } from '../../generated/prisma';

// Solo Zoom: los documentos nacen en la sede activa del request, que en un
// test unitario no existe (docs/PLAN_SEDES.md §2).
jest.mock('../../common/utils/location-context', () => ({
  ...jest.requireActual('../../common/utils/location-context'),
  requireActiveLocationId: jest.fn(() => 'loc-125'),
}));


const mockDtfRepository = {
  findByIdRaw: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  createStatusHistory: jest.fn(),
};

const mockPrisma = {
  product: { findUnique: jest.fn() },
  client: { findUnique: jest.fn() },
  productionArea: { findFirst: jest.fn() },
  payment: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
  order: { update: jest.fn() },
  orderItem: { update: jest.fn() },
  uploadedFile: { update: jest.fn() },
};

const mockStorageService = { getFilesByEntity: jest.fn() };
const mockOrdersService = { create: jest.fn() };
const mockCreditBalanceService = { assertEnoughCredit: jest.fn() };
const mockConsecutivesService = { generateNumber: jest.fn(), syncCounter: jest.fn() };

const makeRecord = (overrides = {}) => ({
  id: 'dtf-1',
  consecutive: 'DTF-TEXTIL-2026-0001',
  locationId: 'loc-104',
  status: DtfStatus.COMPLETADA,
  clientId: 'client-1',
  productId: 'product-1',
  quantity: 100,
  unitPrice: 17000,
  abono: 50000,
  abonoPaymentMethod: PaymentMethod.TRANSFER,
  abonoBankEntity: 'Bancolombia',
  abonoNotes: null,
  applyIva: false,
  ...overrides,
});

describe('DtfService.convertToOrder', () => {
  let service: DtfService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DtfService,
        { provide: DtfRepository, useValue: mockDtfRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConsecutivesService, useValue: mockConsecutivesService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: CreditBalanceService, useValue: mockCreditBalanceService },
      ],
    }).compile();

    service = module.get<DtfService>(DtfService);

    mockDtfRepository.findByIdRaw.mockResolvedValue(makeRecord());
    mockPrisma.product.findUnique.mockResolvedValue({ id: 'product-1', name: 'DTF TEXTIL' });
    mockPrisma.productionArea.findFirst.mockResolvedValue({ id: 'area-1', name: 'DTF Textil' });
    mockStorageService.getFilesByEntity.mockResolvedValue([]);
    mockOrdersService.create.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'OP-2026-0001',
      items: [{ id: 'item-1' }],
    });
    mockPrisma.payment.findFirst.mockResolvedValue({ id: 'payment-1' });
  });

  // El bug que motiva estos tests: el abono se insertaba con Prisma directo
  // "para evitar la maquinaria de cash-session", y el 90% de los abonos DTF
  // nunca llegó al historial de caja. Debe pasar por `ordersService.create`,
  // que es quien genera el CashMovement.
  it('manda el abono como pago inicial de la OP, no como insert directo', async () => {
    await service.convertToOrder('dtf-1', 'user-1');

    expect(mockOrdersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPayment: {
          amount: 50000,
          paymentMethod: PaymentMethod.TRANSFER,
          bankEntity: 'Bancolombia',
          reference: 'DTF-TEXTIL-2026-0001',
          notes: 'Anticipo DTF DTF-TEXTIL-2026-0001',
        },
      }),
      'user-1',
      'loc-104', // la OP hereda la sede de la DTF
    );
  });

  it('NUNCA crea el pago por fuera de ordersService (saltaría la caja)', async () => {
    await service.convertToOrder('dtf-1', 'user-1');

    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });

  it('no toca paidAmount/balance a mano: los calcula ordersService', async () => {
    await service.convertToOrder('dtf-1', 'user-1');

    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it('respeta las notas del abono cuando el usuario las escribió', async () => {
    mockDtfRepository.findByIdRaw.mockResolvedValue(
      makeRecord({ abonoNotes: '  Consignación Davivienda  ' }),
    );

    await service.convertToOrder('dtf-1', 'user-1');

    expect(mockOrdersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPayment: expect.objectContaining({
          notes: '  Consignación Davivienda  ',
        }),
      }),
      'user-1',
      'loc-104', // la OP hereda la sede de la DTF
    );
  });

  it('cae a TRANSFER cuando la DTF no trae método de pago', async () => {
    mockDtfRepository.findByIdRaw.mockResolvedValue(
      makeRecord({ abonoPaymentMethod: null, abonoBankEntity: null }),
    );

    await service.convertToOrder('dtf-1', 'user-1');

    const [dto] = mockOrdersService.create.mock.calls[0];
    expect(dto.initialPayment.paymentMethod).toBe(PaymentMethod.TRANSFER);
    // `null` rompería la validación del DTO, que espera string | undefined.
    expect(dto.initialPayment.bankEntity).toBeUndefined();
  });

  it('no manda pago inicial cuando la DTF no tiene abono', async () => {
    mockDtfRepository.findByIdRaw.mockResolvedValue(makeRecord({ abono: 0 }));

    await service.convertToOrder('dtf-1', 'user-1');

    const [dto] = mockOrdersService.create.mock.calls[0];
    expect(dto.initialPayment).toBeUndefined();
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });

  it('cuelga el comprobante DTF del pago que creó ordersService', async () => {
    mockStorageService.getFilesByEntity.mockImplementation((type: string) =>
      Promise.resolve(type === 'DTF_COMPROBANTE' ? [{ id: 'file-9' }] : []),
    );

    await service.convertToOrder('dtf-1', 'user-1');

    expect(mockPrisma.uploadedFile.update).toHaveBeenCalledWith({
      where: { id: 'file-9' },
      data: { entityType: 'payment', entityId: 'payment-1' },
    });
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { receiptFileId: 'file-9' },
    });
  });

  it('no busca comprobante que colgar si no hubo abono', async () => {
    mockDtfRepository.findByIdRaw.mockResolvedValue(makeRecord({ abono: 0 }));
    mockStorageService.getFilesByEntity.mockImplementation((type: string) =>
      Promise.resolve(type === 'DTF_COMPROBANTE' ? [{ id: 'file-9' }] : []),
    );

    await service.convertToOrder('dtf-1', 'user-1');

    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });
});

// El abono se cobra en el mostrador antes de que exista la OP y puede superar
// el total a cobrar: igual que en el formulario de OP, el excedente queda como
// saldo a favor del cliente. El total a cobrar de la DTF sigue siendo el mismo
// de la OP (con IVA y redondeo comercial), así que el excedente que se guarda
// aquí es exactamente el saldo a favor con el que nacerá la orden.
describe('DtfService — abono por encima del total a cobrar', () => {
  let service: DtfService;

  const buildService = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DtfService,
        { provide: DtfRepository, useValue: mockDtfRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConsecutivesService, useValue: mockConsecutivesService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: CreditBalanceService, useValue: mockCreditBalanceService },
      ],
    }).compile();
    return module.get<DtfService>(DtfService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildService();
    mockPrisma.product.findUnique.mockResolvedValue({ id: 'product-1', name: 'DTF UV' });
    mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
    mockConsecutivesService.generateNumber.mockResolvedValue('DTF-UV-2026-0548');
    mockDtfRepository.create.mockImplementation((data: unknown) => Promise.resolve(data));
  });

  // 50 cm × $70.000/m = $35.000 de base; con IVA el total a cobrar es $41.700.
  const createDto = (abono: number) => ({
    productId: 'product-1',
    clientId: 'client-1',
    quantity: 50,
    unitPrice: 70000,
    applyIva: true,
    abono,
  });

  it('acepta el abono por el total redondeado', async () => {
    await expect(
      service.bulkCreate({ items: [createDto(41700)] } as never, 'user-1'),
    ).resolves.toBeDefined();
  });

  it('acepta un abono que supera el total y lo guarda completo', async () => {
    await expect(
      service.bulkCreate({ items: [createDto(50000)] } as never, 'user-1'),
    ).resolves.toBeDefined();

    // El excedente ($8.300) no se recorta al guardar: es el saldo a favor con el
    // que nacerá la OP al convertir.
    const created = mockDtfRepository.create.mock.calls[0][0] as { abono: Prisma.Decimal };
    expect(Number(created.abono)).toBe(50000);
  });

  it('permite editar dejando el abono por encima del total', async () => {
    mockDtfRepository.findByIdRaw.mockResolvedValue(
      makeRecord({
        status: DtfStatus.BORRADOR,
        quantity: new Prisma.Decimal(50),
        unitPrice: new Prisma.Decimal(70000),
        value: new Prisma.Decimal(35000),
        abono: new Prisma.Decimal(41700),
        applyIva: true,
      }),
    );

    // Baja la cantidad a la mitad: el total a cobrar cae a $20.800 y el abono
    // de $41.700 pasa a ser saldo a favor del cliente en vez de un error.
    await service.update('dtf-1', { quantity: 25 } as never);

    expect(mockDtfRepository.update).toHaveBeenCalledWith(
      'dtf-1',
      expect.objectContaining({ quantity: expect.anything() }),
    );
  });
});

// El abono también puede pagarse con el saldo a favor que el cliente dejó en
// otras OPs. Ese saldo se consume al convertir en OP, así que la DTF valida
// antes de guardarse: si no, quedaría un registro imposible de convertir.
describe('DtfService — abono pagado con saldo a favor', () => {
  let service: DtfService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DtfService,
        { provide: DtfRepository, useValue: mockDtfRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConsecutivesService, useValue: mockConsecutivesService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: CreditBalanceService, useValue: mockCreditBalanceService },
      ],
    }).compile();
    service = module.get<DtfService>(DtfService);

    mockPrisma.product.findUnique.mockResolvedValue({ id: 'product-1', name: 'DTF UV' });
    mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
    mockConsecutivesService.generateNumber.mockResolvedValue('DTF-UV-2026-0549');
    mockDtfRepository.create.mockImplementation((data: unknown) => Promise.resolve(data));
  });

  // 50 cm × $70.000/m con IVA = $41.700 de total a cobrar.
  const createDto = (abono: number) => ({
    productId: 'product-1',
    clientId: 'client-1',
    quantity: 50,
    unitPrice: 70000,
    applyIva: true,
    abono,
    abonoPaymentMethod: PaymentMethod.CREDIT_BALANCE,
  });

  it('valida contra el saldo disponible del cliente antes de guardar', async () => {
    await service.bulkCreate({ items: [createDto(30000)] } as never, 'user-1');

    expect(mockCreditBalanceService.assertEnoughCredit).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({ constructor: Prisma.Decimal }),
    );
    const [, amount] = mockCreditBalanceService.assertEnoughCredit.mock.calls[0];
    expect(Number(amount)).toBe(30000);
  });

  it('propaga el rechazo cuando el cliente no tiene saldo suficiente', async () => {
    mockCreditBalanceService.assertEnoughCredit.mockRejectedValueOnce(
      new BadRequestException('El saldo a favor disponible del cliente (0) es insuficiente'),
    );

    await expect(
      service.bulkCreate({ items: [createDto(30000)] } as never, 'user-1'),
    ).rejects.toThrow(/insuficiente/);

    expect(mockDtfRepository.create).not.toHaveBeenCalled();
  });

  // Mover saldo a favor de una OP a otra no le devuelve nada al cliente: solo
  // deja su plata atrapada en una orden que no la necesita.
  it('no deja que el saldo a favor supere el total a cobrar', async () => {
    await expect(
      service.bulkCreate({ items: [createDto(50000)] } as never, 'user-1'),
    ).rejects.toThrow(/no puede superar el total a cobrar/);

    expect(mockCreditBalanceService.assertEnoughCredit).not.toHaveBeenCalled();
  });

  it('no consulta el saldo cuando el abono se paga en efectivo', async () => {
    await service.bulkCreate(
      { items: [{ ...createDto(30000), abonoPaymentMethod: PaymentMethod.CASH }] } as never,
      'user-1',
    );

    expect(mockCreditBalanceService.assertEnoughCredit).not.toHaveBeenCalled();
  });

  it('revalida el saldo al editar el abono', async () => {
    mockDtfRepository.findByIdRaw.mockResolvedValue(
      makeRecord({
        status: DtfStatus.BORRADOR,
        quantity: new Prisma.Decimal(50),
        unitPrice: new Prisma.Decimal(70000),
        value: new Prisma.Decimal(35000),
        abono: new Prisma.Decimal(10000),
        applyIva: true,
        abonoPaymentMethod: PaymentMethod.CREDIT_BALANCE,
      }),
    );

    await service.update('dtf-1', { abono: 20000 } as never);

    const [, amount] = mockCreditBalanceService.assertEnoughCredit.mock.calls[0];
    expect(Number(amount)).toBe(20000);
  });
});
