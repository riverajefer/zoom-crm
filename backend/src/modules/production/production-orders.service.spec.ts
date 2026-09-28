import { Test, TestingModule } from '@nestjs/testing';
import { ProductionOrdersService } from './production-orders.service';
import { ProductionRepository } from './production.repository';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ProductionOrdersService', () => {
  let service: ProductionOrdersService;
  let repo: jest.Mocked<ProductionRepository>;
  let prisma: any;
  let consecutives: jest.Mocked<ConsecutivesService>;

  const mockRepo = {
    findAllOrders: jest.fn(),
    findOrderById: jest.fn(),
    findTemplateById: jest.fn(),
    findTemplateWithComponents: jest.fn(),
    findStepById: jest.fn(),
    findOrderWithComponents: jest.fn(),
    completeStep: jest.fn(),
    unlockPhaseSteps: jest.fn(),
    updateOrderStatus: jest.fn(),
  };

  let txMock: any;

  const mockPrisma: any = {
    $transaction: jest.fn((cb: any) => cb(txMock)),
    workOrder: { findUnique: jest.fn() },
    productionOrder: { create: jest.fn(), update: jest.fn() },
    productionOrderComponent: { create: jest.fn() },
    productionOrderStep: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };

  const mockConsecutives = {
    generateNumber: jest.fn(),
  };

  beforeEach(async () => {
    txMock = {
      productionOrder: { create: jest.fn(), update: jest.fn() },
      productionOrderComponent: { create: jest.fn() },
      productionOrderStep: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionOrdersService,
        { provide: ProductionRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConsecutivesService, useValue: mockConsecutives },
      ],
    }).compile();

    service = module.get<ProductionOrdersService>(ProductionOrdersService);
    repo = module.get(ProductionRepository) as any;
    prisma = module.get(PrismaService) as any;
    consecutives = module.get(ConsecutivesService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should call repo.findAllOrders with defaults', async () => {
      repo.findAllOrders.mockResolvedValue([[], 0] as any);
      const result = await service.findAll({});
      expect(repo.findAllOrders).toHaveBeenCalledWith({
        search: undefined, status: undefined, workOrderId: undefined, page: 1, limit: 20,
      });
      expect(result).toEqual({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    });

    it('should pass filters and compute totalPages', async () => {
      repo.findAllOrders.mockResolvedValue([[{ id: '1' }], 25] as any);
      const result = await service.findAll({ page: 2, limit: 10, search: 'OP' } as any);
      expect(repo.findAllOrders).toHaveBeenCalledWith({
        search: 'OP', status: undefined, workOrderId: undefined, page: 2, limit: 10,
      });
      expect(result.meta).toEqual({ total: 25, page: 2, limit: 10, totalPages: 3 });
    });
  });

  describe('findOne', () => {
    it('should return order with progress calculation', async () => {
      repo.findOrderById.mockResolvedValue({
        id: '1',
        components: [
          {
            id: 'c1',
            steps: [
              { status: 'COMPLETED' },
              { status: 'IN_PROGRESS' },
            ],
          },
        ],
      } as any);
      const result = await service.findOne('1');
      expect(result.components[0].progress).toBe(50);
      expect(result.progress).toEqual({ total: 50, completedSteps: 1, totalSteps: 2 });
    });

    it('should handle empty components', async () => {
      repo.findOrderById.mockResolvedValue({ id: '1', components: [] } as any);
      const result = await service.findOne('1');
      expect(result.progress).toEqual({ total: 0, completedSteps: 0, totalSteps: 0 });
    });

    it('should count SKIPPED steps as completed', async () => {
      repo.findOrderById.mockResolvedValue({
        id: '1',
        components: [{ steps: [{ status: 'SKIPPED' }, { status: 'COMPLETED' }] }],
      } as any);
      const result = await service.findOne('1');
      expect(result.progress.total).toBe(100);
    });

    it('should throw if order not found', async () => {
      repo.findOrderById.mockResolvedValue(null);
      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });

    it('should handle component with 0 steps (0% progress)', async () => {
      repo.findOrderById.mockResolvedValue({
        id: '1',
        components: [{ steps: [] }],
      } as any);
      const result = await service.findOne('1');
      expect(result.components[0].progress).toBe(0);
    });
  });

  describe('getProgress', () => {
    it('should return progress from findOne', async () => {
      repo.findOrderById.mockResolvedValue({
        id: '1',
        components: [{ steps: [{ status: 'COMPLETED' }] }],
      } as any);
      const result = await service.getProgress('1');
      expect(result).toEqual({ total: 100, completedSteps: 1, totalSteps: 1 });
    });
  });

  describe('create', () => {
    const dto = { templateId: 't1', workOrderId: 'wo1', notes: 'test' };

    it('should throw NotFoundException if workOrder not found', async () => {
      mockPrisma.workOrder.findUnique.mockResolvedValue(null);
      await expect(service.create(dto, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if template not found', async () => {
      mockPrisma.workOrder.findUnique.mockResolvedValue({ id: 'wo1', locationId: 'loc-125' });
      mockRepo.findTemplateWithComponents.mockResolvedValue(null);
      await expect(service.create(dto, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if template is inactive', async () => {
      mockPrisma.workOrder.findUnique.mockResolvedValue({ id: 'wo1', locationId: 'loc-125' });
      mockRepo.findTemplateWithComponents.mockResolvedValue({ id: 't1', isActive: false, components: [] });
      await expect(service.create(dto, 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should create order with components and steps in transaction', async () => {
      mockPrisma.workOrder.findUnique.mockResolvedValue({ id: 'wo1', locationId: 'loc-125' });
      mockRepo.findTemplateWithComponents.mockResolvedValue({
        id: 't1', isActive: true,
        components: [
          {
            name: 'Impresion', order: 1, phase: 'impresion',
            steps: [{ stepDefinitionId: 'sd1', order: 1 }],
          },
          {
            name: 'Armado', order: 2, phase: 'armado',
            steps: [{ stepDefinitionId: 'sd2', order: 1 }],
          },
        ],
      });
      mockConsecutives.generateNumber.mockResolvedValue('OPROD-001');
      txMock.productionOrder.create.mockResolvedValue({ id: 'po1' });
      txMock.productionOrderComponent.create
        .mockResolvedValueOnce({ id: 'c1' })
        .mockResolvedValueOnce({ id: 'c2' });
      txMock.productionOrder.update.mockResolvedValue({ id: 'po1', status: 'IN_PROGRESS' });

      const result = await service.create(dto, 'u1');

      expect(mockConsecutives.generateNumber).toHaveBeenCalledWith('PRODUCTION_ORDER', 'loc-125');
      expect(txMock.productionOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ oprodNumber: 'OPROD-001', templateId: 't1', workOrderId: 'wo1' }),
      });
      expect(txMock.productionOrderComponent.create).toHaveBeenCalledTimes(2);
      expect(txMock.productionOrderStep.create).toHaveBeenCalledTimes(2);
      // armado phase should be BLOCKED
      expect(txMock.productionOrderStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'BLOCKED' }),
      });
      // impresion phase should be PENDING
      expect(txMock.productionOrderStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'PENDING' }),
      });
      expect(result).toEqual({ id: 'po1', status: 'IN_PROGRESS' });
    });

    it('should mark despacho phase as BLOCKED', async () => {
      mockPrisma.workOrder.findUnique.mockResolvedValue({ id: 'wo1', locationId: 'loc-125' });
      mockRepo.findTemplateWithComponents.mockResolvedValue({
        id: 't1', isActive: true,
        components: [{
          name: 'Despacho', order: 1, phase: 'despacho',
          steps: [{ stepDefinitionId: 'sd1', order: 1 }],
        }],
      });
      mockConsecutives.generateNumber.mockResolvedValue('OPROD-002');
      txMock.productionOrder.create.mockResolvedValue({ id: 'po2' });
      txMock.productionOrderComponent.create.mockResolvedValue({ id: 'c1' });
      txMock.productionOrder.update.mockResolvedValue({ id: 'po2' });

      await service.create(dto, 'u1');
      expect(txMock.productionOrderStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'BLOCKED' }),
      });
    });
  });

  describe('updateSpecification', () => {
    it('should throw NotFoundException if step not found', async () => {
      mockRepo.findStepById.mockResolvedValue(null);
      await expect(service.updateSpecification('o1', 's1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if step not from this order', async () => {
      mockRepo.findStepById.mockResolvedValue({
        id: 's1', status: 'PENDING', component: { productionOrderId: 'other' },
        fieldValues: { specification: {}, execution: {} },
      });
      await expect(service.updateSpecification('o1', 's1', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if step is completed', async () => {
      mockRepo.findStepById.mockResolvedValue({
        id: 's1', status: 'COMPLETED', component: { productionOrderId: 'o1' },
        fieldValues: { specification: {}, execution: {} },
      });
      await expect(service.updateSpecification('o1', 's1', {})).rejects.toThrow(BadRequestException);
    });

    it('should merge specification data and update', async () => {
      mockRepo.findStepById.mockResolvedValue({
        id: 's1', status: 'PENDING', component: { productionOrderId: 'o1' },
        fieldValues: { specification: { color: 'red' }, execution: { qty: 5 } },
      });
      mockPrisma.productionOrderStep.update.mockResolvedValue({ id: 's1' });

      await service.updateSpecification('o1', 's1', { size: 'L' });

      expect(mockPrisma.productionOrderStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          fieldValues: {
            specification: { color: 'red', size: 'L' },
            execution: { qty: 5 },
          },
        },
      });
    });
  });

  describe('updateExecution', () => {
    it('should throw NotFoundException if step not found', async () => {
      mockRepo.findStepById.mockResolvedValue(null);
      await expect(service.updateExecution('o1', 's1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if step not from this order', async () => {
      mockRepo.findStepById.mockResolvedValue({
        id: 's1', status: 'PENDING', component: { productionOrderId: 'other' },
        fieldValues: { specification: {}, execution: {} },
      });
      await expect(service.updateExecution('o1', 's1', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if step is completed', async () => {
      mockRepo.findStepById.mockResolvedValue({
        id: 's1', status: 'COMPLETED', component: { productionOrderId: 'o1' },
        fieldValues: { specification: {}, execution: {} },
      });
      await expect(service.updateExecution('o1', 's1', {})).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if step is blocked', async () => {
      mockRepo.findStepById.mockResolvedValue({
        id: 's1', status: 'BLOCKED', component: { productionOrderId: 'o1' },
        fieldValues: { specification: {}, execution: {} },
      });
      await expect(service.updateExecution('o1', 's1', {})).rejects.toThrow(BadRequestException);
    });

    it('should merge execution data and set IN_PROGRESS if PENDING', async () => {
      mockRepo.findStepById.mockResolvedValue({
        id: 's1', status: 'PENDING', component: { productionOrderId: 'o1' },
        fieldValues: { specification: { x: 1 }, execution: { qty: 5 } },
      });
      mockPrisma.productionOrderStep.update.mockResolvedValue({ id: 's1' });

      await service.updateExecution('o1', 's1', { notes: 'ok' });

      expect(mockPrisma.productionOrderStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          fieldValues: {
            specification: { x: 1 },
            execution: { qty: 5, notes: 'ok' },
          },
          status: 'IN_PROGRESS',
        },
      });
    });

    it('should keep current status if not PENDING', async () => {
      mockRepo.findStepById.mockResolvedValue({
        id: 's1', status: 'IN_PROGRESS', component: { productionOrderId: 'o1' },
        fieldValues: { specification: {}, execution: {} },
      });
      mockPrisma.productionOrderStep.update.mockResolvedValue({ id: 's1' });

      await service.updateExecution('o1', 's1', { notes: 'ok' });

      expect(mockPrisma.productionOrderStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      });
    });
  });

  describe('completeStep', () => {
    const baseStep = {
      id: 's1',
      order: 1,
      status: 'IN_PROGRESS',
      componentId: 'c1',
      component: { productionOrderId: 'o1', phase: 'impresion' },
      stepDefinition: { fieldSchema: { fields: [] } },
      fieldValues: { specification: {}, execution: {} },
    };

    it('should throw NotFoundException if step not found', async () => {
      mockRepo.findStepById.mockResolvedValue(null);
      await expect(service.completeStep('o1', 's1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if step not from order', async () => {
      mockRepo.findStepById.mockResolvedValue({ ...baseStep, component: { productionOrderId: 'other', phase: 'impresion' } });
      await expect(service.completeStep('o1', 's1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already completed', async () => {
      mockRepo.findStepById.mockResolvedValue({ ...baseStep, status: 'COMPLETED' });
      await expect(service.completeStep('o1', 's1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if blocked', async () => {
      mockRepo.findStepById.mockResolvedValue({ ...baseStep, status: 'BLOCKED' });
      await expect(service.completeStep('o1', 's1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw if required execution fields are missing', async () => {
      mockRepo.findStepById.mockResolvedValue({
        ...baseStep,
        stepDefinition: {
          fieldSchema: {
            fields: [{ key: 'qty', label: 'Cantidad', type: 'number', stage: 'execution', required: true }],
          },
        },
        fieldValues: { specification: {}, execution: {} },
      });
      await expect(service.completeStep('o1', 's1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw if previous step is not completed', async () => {
      mockRepo.findStepById.mockResolvedValue({ ...baseStep, order: 2 });
      mockPrisma.productionOrderStep.findFirst.mockResolvedValue({ status: 'IN_PROGRESS' });
      await expect(service.completeStep('o1', 's1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should allow completion if previous step is SKIPPED', async () => {
      mockRepo.findStepById
        .mockResolvedValueOnce({ ...baseStep, order: 2 })
        .mockResolvedValueOnce({ ...baseStep, status: 'COMPLETED' });
      mockPrisma.productionOrderStep.findFirst.mockResolvedValue({ status: 'SKIPPED' });
      mockRepo.completeStep.mockResolvedValue(undefined);
      mockRepo.findOrderWithComponents.mockResolvedValue({
        components: [{ phase: 'impresion', steps: [{ status: 'COMPLETED' }] }],
      });

      await service.completeStep('o1', 's1', 'u1');
      expect(mockRepo.completeStep).toHaveBeenCalledWith('s1', 'u1');
    });

    it('should complete step and check order completion', async () => {
      mockRepo.findStepById
        .mockResolvedValueOnce(baseStep)
        .mockResolvedValueOnce({ ...baseStep, status: 'COMPLETED' });
      mockRepo.completeStep.mockResolvedValue(undefined);
      mockRepo.findOrderWithComponents.mockResolvedValue({
        components: [{ phase: 'impresion', steps: [{ status: 'COMPLETED' }] }],
      });

      const result = await service.completeStep('o1', 's1', 'u1');
      expect(mockRepo.completeStep).toHaveBeenCalledWith('s1', 'u1');
    });

    it('should unlock armado phase when impresion+material done', async () => {
      mockRepo.findStepById
        .mockResolvedValueOnce({ ...baseStep, component: { productionOrderId: 'o1', phase: 'impresion' } })
        .mockResolvedValueOnce({ ...baseStep, status: 'COMPLETED' });
      mockRepo.completeStep.mockResolvedValue(undefined);
      mockRepo.findOrderWithComponents.mockResolvedValue({
        components: [
          { phase: 'impresion', steps: [{ status: 'COMPLETED' }] },
          { phase: 'material', steps: [{ status: 'COMPLETED' }] },
          { phase: 'armado', steps: [{ status: 'BLOCKED' }] },
        ],
      });
      mockRepo.unlockPhaseSteps.mockResolvedValue(undefined);
      mockRepo.updateOrderStatus.mockResolvedValue(undefined);

      await service.completeStep('o1', 's1', 'u1');
      expect(mockRepo.unlockPhaseSteps).toHaveBeenCalledWith('o1', 'armado');
    });

    it('should NOT unlock armado if parallel phases not all done', async () => {
      mockRepo.findStepById
        .mockResolvedValueOnce({ ...baseStep, component: { productionOrderId: 'o1', phase: 'impresion' } })
        .mockResolvedValueOnce({ ...baseStep, status: 'COMPLETED' });
      mockRepo.completeStep.mockResolvedValue(undefined);
      mockRepo.findOrderWithComponents.mockResolvedValue({
        components: [
          { phase: 'impresion', steps: [{ status: 'COMPLETED' }] },
          { phase: 'material', steps: [{ status: 'IN_PROGRESS' }] },
        ],
      });

      await service.completeStep('o1', 's1', 'u1');
      expect(mockRepo.unlockPhaseSteps).not.toHaveBeenCalled();
    });

    it('should unlock despacho when armado is done', async () => {
      mockRepo.findStepById
        .mockResolvedValueOnce({ ...baseStep, component: { productionOrderId: 'o1', phase: 'armado' } })
        .mockResolvedValueOnce({ ...baseStep, status: 'COMPLETED' });
      mockRepo.completeStep.mockResolvedValue(undefined);
      mockRepo.findOrderWithComponents.mockResolvedValue({
        components: [
          { phase: 'armado', steps: [{ status: 'COMPLETED' }] },
          { phase: 'despacho', steps: [{ status: 'BLOCKED' }] },
        ],
      });
      mockRepo.unlockPhaseSteps.mockResolvedValue(undefined);

      await service.completeStep('o1', 's1', 'u1');
      expect(mockRepo.unlockPhaseSteps).toHaveBeenCalledWith('o1', 'despacho');
    });

    it('should mark order COMPLETED when all steps done', async () => {
      mockRepo.findStepById
        .mockResolvedValueOnce(baseStep)
        .mockResolvedValueOnce({ ...baseStep, status: 'COMPLETED' });
      mockRepo.completeStep.mockResolvedValue(undefined);
      mockRepo.findOrderWithComponents.mockResolvedValue({
        components: [
          { phase: 'impresion', steps: [{ status: 'COMPLETED' }] },
        ],
      });
      mockRepo.updateOrderStatus.mockResolvedValue(undefined);

      await service.completeStep('o1', 's1', 'u1');
      expect(mockRepo.updateOrderStatus).toHaveBeenCalledWith('o1', 'COMPLETED');
    });

    it('should NOT mark order COMPLETED if some steps not done', async () => {
      mockRepo.findStepById
        .mockResolvedValueOnce(baseStep)
        .mockResolvedValueOnce({ ...baseStep, status: 'COMPLETED' });
      mockRepo.completeStep.mockResolvedValue(undefined);
      mockRepo.findOrderWithComponents.mockResolvedValue({
        components: [
          { phase: 'impresion', steps: [{ status: 'COMPLETED' }, { status: 'PENDING' }] },
        ],
      });

      await service.completeStep('o1', 's1', 'u1');
      expect(mockRepo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it('should handle null order in tryUnlockNextPhase gracefully', async () => {
      mockRepo.findStepById
        .mockResolvedValueOnce(baseStep)
        .mockResolvedValueOnce({ ...baseStep, status: 'COMPLETED' });
      mockRepo.completeStep.mockResolvedValue(undefined);
      mockRepo.findOrderWithComponents.mockResolvedValue(null);

      await expect(service.completeStep('o1', 's1', 'u1')).resolves.toBeDefined();
    });
  });
});
