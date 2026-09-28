import { Test, TestingModule } from '@nestjs/testing';
import { ProductionRepository } from './production.repository';
import { PrismaService } from '../../database/prisma.service';

describe('ProductionRepository', () => {
  let repository: ProductionRepository;
  let prisma: any;

  const mockPrisma = {
    productTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    templateComponent: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    templateComponentStep: {
      create: jest.fn(),
    },
    stepDefinition: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    productionOrder: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    productionOrderComponent: {
      create: jest.fn(),
    },
    productionOrderStep: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<ProductionRepository>(ProductionRepository);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  // ─── Step Definitions ────────────────────────────────────

  describe('findAllStepDefinitions', () => {
    it('should call prisma.stepDefinition.findMany', async () => {
      prisma.stepDefinition.findMany.mockResolvedValue([]);
      const result = await repository.findAllStepDefinitions();
      expect(result).toEqual([]);
      expect(prisma.stepDefinition.findMany).toHaveBeenCalled();
    });
  });

  describe('findStepDefinitionById', () => {
    it('should call findUnique with id', async () => {
      prisma.stepDefinition.findUnique.mockResolvedValue({ id: 'sd1' });
      const result = await repository.findStepDefinitionById('sd1');
      expect(result).toEqual({ id: 'sd1' });
      expect(prisma.stepDefinition.findUnique).toHaveBeenCalledWith({
        where: { id: 'sd1' },
        select: expect.any(Object),
      });
    });
  });

  describe('updateStepDefinitionFieldSchema', () => {
    it('should update fieldSchema', async () => {
      prisma.stepDefinition.update.mockResolvedValue({ id: 'sd1', fieldSchema: { fields: [] } });
      const result = await repository.updateStepDefinitionFieldSchema('sd1', { fields: [] });
      expect(prisma.stepDefinition.update).toHaveBeenCalledWith({
        where: { id: 'sd1' },
        data: { fieldSchema: { fields: [] } },
        select: expect.any(Object),
      });
      expect(result.fieldSchema).toEqual({ fields: [] });
    });
  });

  describe('findStepDefinitionByType', () => {
    it('should call findUnique with type', async () => {
      prisma.stepDefinition.findUnique.mockResolvedValue({ id: 'sd1', type: 'CUT' });
      const result = await repository.findStepDefinitionByType('CUT');
      expect(prisma.stepDefinition.findUnique).toHaveBeenCalledWith({
        where: { type: 'CUT' },
        select: { id: true, type: true },
      });
      expect(result?.type).toBe('CUT');
    });
  });

  describe('createStepDefinition', () => {
    it('should create with default fieldSchema', async () => {
      prisma.stepDefinition.create.mockResolvedValue({ id: 'sd1', name: 'Corte', type: 'CUT' });
      const result = await repository.createStepDefinition({ name: 'Corte', type: 'CUT' });
      expect(prisma.stepDefinition.create).toHaveBeenCalledWith({
        data: { name: 'Corte', type: 'CUT', description: undefined, fieldSchema: { fields: [] } },
        select: expect.any(Object),
      });
      expect(result.name).toBe('Corte');
    });
  });

  describe('findStepDefinitionWithOrderSteps', () => {
    it('should include productionOrderSteps', async () => {
      prisma.stepDefinition.findUnique.mockResolvedValue({ id: 'sd1', productionOrderSteps: [] });
      const result = await repository.findStepDefinitionWithOrderSteps('sd1');
      expect(prisma.stepDefinition.findUnique).toHaveBeenCalledWith({
        where: { id: 'sd1' },
        select: { id: true, productionOrderSteps: { take: 1, select: { id: true } } },
      });
      expect(result?.productionOrderSteps).toEqual([]);
    });
  });

  // ─── Templates ───────────────────────────────────────────

  describe('findAllTemplates', () => {
    it('should call prisma.productTemplate.findMany without filters', async () => {
      prisma.productTemplate.findMany.mockResolvedValue([]);
      const result = await repository.findAllTemplates({});
      expect(result).toEqual([]);
      expect(prisma.productTemplate.findMany).toHaveBeenCalled();
    });

    it('should apply category and isActive filters', async () => {
      prisma.productTemplate.findMany.mockResolvedValue([]);
      await repository.findAllTemplates({ category: 'PUERTA', isActive: true });
      expect(prisma.productTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category: 'PUERTA', isActive: true },
        }),
      );
    });
  });

  describe('findTemplateById', () => {
    it('should call prisma.productTemplate.findUnique', async () => {
      prisma.productTemplate.findUnique.mockResolvedValue({ id: '1' });
      const result = await repository.findTemplateById('1');
      expect(result).toEqual({ id: '1' });
      expect(prisma.productTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        select: expect.any(Object),
      });
    });
  });

  describe('findTemplateWithComponents', () => {
    it('should include components and steps', async () => {
      prisma.productTemplate.findUnique.mockResolvedValue({ id: '1', components: [] });
      const result = await repository.findTemplateWithComponents('1');
      expect(prisma.productTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: expect.objectContaining({ components: expect.any(Object) }),
      });
    });
  });

  describe('createTemplate', () => {
    it('should call prisma.productTemplate.create', async () => {
      prisma.productTemplate.create.mockResolvedValue({ id: '1' });
      const result = await repository.createTemplate({ name: 'T', category: 'C' });
      expect(prisma.productTemplate.create).toHaveBeenCalledWith({ data: { name: 'T', category: 'C' } });
      expect(result.id).toBe('1');
    });
  });

  describe('updateTemplate', () => {
    it('should call prisma.productTemplate.update', async () => {
      prisma.productTemplate.update.mockResolvedValue({ id: '1', name: 'T2' });
      const result = await repository.updateTemplate('1', { name: 'T2' });
      expect(prisma.productTemplate.update).toHaveBeenCalledWith({ where: { id: '1' }, data: { name: 'T2' } });
    });
  });

  describe('softDeleteTemplate', () => {
    it('should set isActive to false', async () => {
      prisma.productTemplate.update.mockResolvedValue({ id: '1', isActive: false });
      const result = await repository.softDeleteTemplate('1');
      expect(prisma.productTemplate.update).toHaveBeenCalledWith({ where: { id: '1' }, data: { isActive: false } });
    });
  });

  // ─── Components & Steps ──────────────────────────────────

  describe('createComponent', () => {
    it('should call prisma.templateComponent.create', async () => {
      const data = { templateId: 't1', name: 'C1', order: 1, phase: 'impresion' as any, isRequired: true };
      prisma.templateComponent.create.mockResolvedValue({ id: 'tc1' });
      const result = await repository.createComponent(data);
      expect(prisma.templateComponent.create).toHaveBeenCalledWith({ data });
      expect(result.id).toBe('tc1');
    });
  });

  describe('createComponentStep', () => {
    it('should call prisma.templateComponentStep.create', async () => {
      const data = { componentId: 'tc1', stepDefinitionId: 'sd1', order: 1, isRequired: true };
      prisma.templateComponentStep.create.mockResolvedValue({ id: 'tcs1' });
      const result = await repository.createComponentStep(data);
      expect(prisma.templateComponentStep.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('deleteComponentsByTemplateId', () => {
    it('should call deleteMany', async () => {
      prisma.templateComponent.deleteMany.mockResolvedValue({ count: 2 });
      await repository.deleteComponentsByTemplateId('t1');
      expect(prisma.templateComponent.deleteMany).toHaveBeenCalledWith({ where: { templateId: 't1' } });
    });
  });

  // ─── Production Orders ───────────────────────────────────

  describe('findAllOrders', () => {
    it('should call findMany and count', async () => {
      prisma.productionOrder.findMany.mockResolvedValue([{ id: '1' }]);
      prisma.productionOrder.count.mockResolvedValue(1);
      const [orders, total] = await repository.findAllOrders({ page: 1, limit: 10 });
      expect(orders).toEqual([{ id: '1' }]);
      expect(total).toBe(1);
      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('should apply status, search and workOrderId filters', async () => {
      prisma.productionOrder.findMany.mockResolvedValue([]);
      prisma.productionOrder.count.mockResolvedValue(0);
      await repository.findAllOrders({ page: 2, limit: 5, status: 'PENDING' as any, search: 'OP', workOrderId: 'wo1' });
      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          where: expect.objectContaining({
            status: 'PENDING',
            workOrderId: 'wo1',
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('findOrderById', () => {
    it('should call prisma.productionOrder.findUnique', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({ id: '1' });
      const result = await repository.findOrderById('1');
      expect(result).toEqual({ id: '1' });
      expect(prisma.productionOrder.findUnique).toHaveBeenCalled();
    });
  });

  describe('findOrderWithComponents', () => {
    it('should include components with steps', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({ id: '1', components: [] });
      const result = await repository.findOrderWithComponents('1');
      expect(prisma.productionOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: '1' }, include: expect.any(Object) }),
      );
    });
  });

  describe('createOrder', () => {
    it('should call prisma.productionOrder.create', async () => {
      const data = { oprodNumber: 'OP-1', locationId: 'loc-125', templateId: 't1', workOrderId: 'wo1', createdById: 'u1' };
      prisma.productionOrder.create.mockResolvedValue({ id: 'po1' });
      const result = await repository.createOrder(data);
      expect(prisma.productionOrder.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('createOrderComponent', () => {
    it('should call prisma.productionOrderComponent.create', async () => {
      const data = { productionOrderId: 'po1', name: 'C1', order: 1, phase: 'impresion' as any };
      prisma.productionOrderComponent.create.mockResolvedValue({ id: 'poc1' });
      await repository.createOrderComponent(data);
      expect(prisma.productionOrderComponent.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('createOrderStep', () => {
    it('should call prisma.productionOrderStep.create', async () => {
      const data = { componentId: 'c1', stepDefinitionId: 'sd1', order: 1, status: 'PENDING' as any, fieldValues: {} };
      prisma.productionOrderStep.create.mockResolvedValue({ id: 'pos1' });
      await repository.createOrderStep(data);
      expect(prisma.productionOrderStep.create).toHaveBeenCalledWith({ data });
    });
  });

  // ─── Steps Operations ────────────────────────────────────

  describe('findStepById', () => {
    it('should call findUnique with include', async () => {
      prisma.productionOrderStep.findUnique.mockResolvedValue({ id: 's1' });
      const result = await repository.findStepById('s1');
      expect(prisma.productionOrderStep.findUnique).toHaveBeenCalledWith({
        where: { id: 's1' },
        include: expect.objectContaining({ stepDefinition: true, component: expect.any(Object) }),
      });
    });
  });

  describe('completeStep', () => {
    it('should update status to COMPLETED', async () => {
      prisma.productionOrderStep.update.mockResolvedValue({ id: 's1', status: 'COMPLETED' });
      await repository.completeStep('s1', 'u1');
      expect(prisma.productionOrderStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'COMPLETED', completedById: 'u1' }),
      });
    });
  });

  describe('unlockPhaseSteps', () => {
    it('should updateMany BLOCKED to PENDING', async () => {
      prisma.productionOrderStep.updateMany.mockResolvedValue({ count: 3 });
      await repository.unlockPhaseSteps('po1', 'armado' as any);
      expect(prisma.productionOrderStep.updateMany).toHaveBeenCalledWith({
        where: { status: 'BLOCKED', component: { productionOrderId: 'po1', phase: 'armado' } },
        data: { status: 'PENDING' },
      });
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status', async () => {
      prisma.productionOrder.update.mockResolvedValue({ id: 'po1', status: 'COMPLETED' });
      await repository.updateOrderStatus('po1', 'COMPLETED' as any);
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({ where: { id: 'po1' }, data: { status: 'COMPLETED' } });
    });
  });

  describe('updateStepSpecification', () => {
    it('should update step with spec data', async () => {
      prisma.productionOrderStep.update.mockResolvedValue({ id: 's1' });
      await repository.updateStepSpecification('s1', { color: 'red' });
      expect(prisma.productionOrderStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      });
    });
  });

  describe('updateStepExecution', () => {
    it('should update step with exec data', async () => {
      prisma.productionOrderStep.update.mockResolvedValue({ id: 's1' });
      await repository.updateStepExecution('s1', { qty: 10 });
      expect(prisma.productionOrderStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      });
    });
  });
});
