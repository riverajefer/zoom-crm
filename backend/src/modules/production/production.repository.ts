import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ComponentPhase, ProductionOrderStatus, ProductionStepStatus } from '../../generated/prisma';
import { clampPageSize, MAX_PAGE_SIZE } from '../../common/dto/pagination.dto';

// Select for full template detail with components and steps
const templateWithComponentsSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  components: {
    orderBy: { order: 'asc' as const },
    select: {
      id: true,
      name: true,
      order: true,
      phase: true,
      isRequired: true,
      steps: {
        orderBy: { order: 'asc' as const },
        select: {
          id: true,
          order: true,
          isRequired: true,
          fieldOverrides: true,
          stepDefinition: {
            select: { id: true, type: true, name: true, description: true, fieldSchema: true },
          },
        },
      },
    },
  },
};

// Select for production order step with stepDefinition
const orderStepSelect = {
  id: true,
  order: true,
  status: true,
  fieldValues: true,
  completedAt: true,
  notes: true,
  stepDefinition: {
    select: { id: true, type: true, name: true, fieldSchema: true },
  },
  completedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
};

// Select for full production order detail
const orderWithDetailSelect = {
  id: true,
  oprodNumber: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  template: { select: { id: true, name: true, category: true } },
  workOrder: { select: { id: true, workOrderNumber: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  components: {
    orderBy: { order: 'asc' as const },
    select: {
      id: true,
      name: true,
      order: true,
      phase: true,
      steps: {
        orderBy: { order: 'asc' as const },
        select: orderStepSelect,
      },
    },
  },
};

@Injectable()
export class ProductionRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Step Definitions ────────────────────────────────────────────────────────

  findAllStepDefinitions() {
    return this.prisma.stepDefinition.findMany({
      select: { id: true, type: true, name: true, description: true, fieldSchema: true },
      orderBy: { type: 'asc' },
    });
  }

  findStepDefinitionById(id: string) {
    return this.prisma.stepDefinition.findUnique({
      where: { id },
      select: { id: true, type: true, name: true, description: true, fieldSchema: true },
    });
  }

  updateStepDefinitionFieldSchema(id: string, fieldSchema: object) {
    return this.prisma.stepDefinition.update({
      where: { id },
      data: { fieldSchema },
      select: { id: true, type: true, name: true, description: true, fieldSchema: true },
    });
  }

  findStepDefinitionByType(type: string) {
    return this.prisma.stepDefinition.findUnique({
      where: { type },
      select: { id: true, type: true },
    });
  }

  createStepDefinition(data: { name: string; type: string; description?: string }) {
    return this.prisma.stepDefinition.create({
      data: {
        name: data.name,
        type: data.type,
        description: data.description,
        fieldSchema: { fields: [] },
      },
      select: { id: true, type: true, name: true, description: true, fieldSchema: true },
    });
  }

  findStepDefinitionWithOrderSteps(id: string) {
    return this.prisma.stepDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        productionOrderSteps: {
          take: 1,
          select: { id: true },
        },
      },
    });
  }

  // ─── Product Templates ───────────────────────────────────────────────────────

  findAllTemplates(filters: { category?: string; isActive?: boolean }) {
    return this.prisma.productTemplate.findMany({
      where: {
        ...(filters.category && { category: filters.category }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      },
      select: {
        id: true, name: true, category: true, description: true, isActive: true,
        createdAt: true, updatedAt: true,
        _count: { select: { components: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  findTemplateById(id: string) {
    return this.prisma.productTemplate.findUnique({
      where: { id },
      select: templateWithComponentsSelect,
    });
  }

  // For instantiation - needs ordered components and steps
  findTemplateWithComponents(id: string) {
    return this.prisma.productTemplate.findUnique({
      where: { id },
      include: {
        components: {
          orderBy: { order: 'asc' },
          include: {
            steps: {
              orderBy: { order: 'asc' },
              include: { stepDefinition: true },
            },
          },
        },
      },
    });
  }

  createTemplate(data: {
    name: string;
    category: string;
    description?: string;
  }) {
    return this.prisma.productTemplate.create({ data });
  }

  updateTemplate(id: string, data: Partial<{ name: string; category: string; description: string; isActive: boolean }>) {
    return this.prisma.productTemplate.update({ where: { id }, data });
  }

  softDeleteTemplate(id: string) {
    return this.prisma.productTemplate.update({ where: { id }, data: { isActive: false } });
  }

  // ─── Template Components & Steps (for building templates) ───────────────────

  createComponent(data: {
    templateId: string;
    name: string;
    order: number;
    phase: ComponentPhase;
    isRequired: boolean;
  }) {
    return this.prisma.templateComponent.create({ data });
  }

  createComponentStep(data: {
    componentId: string;
    stepDefinitionId: string;
    order: number;
    isRequired: boolean;
    fieldOverrides?: any;
  }) {
    return this.prisma.templateComponentStep.create({ data });
  }

  deleteComponentsByTemplateId(templateId: string) {
    return this.prisma.templateComponent.deleteMany({ where: { templateId } });
  }

  // ─── Production Orders ───────────────────────────────────────────────────────

  findAllOrders(filters: { status?: ProductionOrderStatus; search?: string; workOrderId?: string; page: number; limit: number }) {
    const take = clampPageSize(filters.limit, 20, MAX_PAGE_SIZE);
    const skip = (filters.page - 1) * take;
    const where = {
      ...(filters.status && { status: filters.status }),
      ...(filters.workOrderId && { workOrderId: filters.workOrderId }),
      ...(filters.search && {
        OR: [
          { oprodNumber: { contains: filters.search, mode: 'insensitive' as const } },
          { template: { name: { contains: filters.search, mode: 'insensitive' as const } } },
        ],
      }),
    };

    return Promise.all([
      this.prisma.productionOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, oprodNumber: true, status: true, notes: true, createdAt: true,
          template: { select: { id: true, name: true, category: true } },
          workOrder: { select: { id: true, workOrderNumber: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { components: true } },
        },
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
  }

  findOrderById(id: string) {
    return this.prisma.productionOrder.findUnique({
      where: { id },
      select: orderWithDetailSelect,
    });
  }

  // For phase-unlock logic — needs all component statuses
  findOrderWithComponents(id: string) {
    return this.prisma.productionOrder.findUnique({
      where: { id },
      include: {
        components: {
          include: { steps: { select: { id: true, status: true, order: true } } },
        },
      },
    });
  }

  createOrder(data: {
    oprodNumber: string;
    /** Sede de la OT de la que nace (docs/PLAN_SEDES.md §2). */
    locationId: string;
    templateId: string;
    workOrderId: string;
    status?: ProductionOrderStatus;
    notes?: string;
    createdById: string;
  }) {
    return this.prisma.productionOrder.create({ data });
  }

  createOrderComponent(data: { productionOrderId: string; name: string; order: number; phase: ComponentPhase }) {
    return this.prisma.productionOrderComponent.create({ data });
  }

  createOrderStep(data: {
    componentId: string;
    stepDefinitionId: string;
    order: number;
    status: ProductionStepStatus;
    fieldValues: object;
  }) {
    return this.prisma.productionOrderStep.create({ data });
  }

  // ─── Production Steps ────────────────────────────────────────────────────────

  findStepById(stepId: string) {
    return this.prisma.productionOrderStep.findUnique({
      where: { id: stepId },
      include: {
        stepDefinition: true,
        component: { select: { id: true, productionOrderId: true, phase: true } },
      },
    });
  }

  updateStepSpecification(stepId: string, specData: Record<string, any>) {
    return this.prisma.productionOrderStep.update({
      where: { id: stepId },
      data: {
        fieldValues: {
          // We merge via a raw update using JSON
          specification: specData,
        } as any,
        status: ProductionStepStatus.IN_PROGRESS,
      },
    });
  }

  updateStepExecution(stepId: string, execData: Record<string, any>) {
    return this.prisma.productionOrderStep.update({
      where: { id: stepId },
      data: {
        fieldValues: {
          execution: execData,
        } as any,
        status: ProductionStepStatus.IN_PROGRESS,
      },
    });
  }

  completeStep(stepId: string, userId: string) {
    return this.prisma.productionOrderStep.update({
      where: { id: stepId },
      data: {
        status: ProductionStepStatus.COMPLETED,
        completedAt: new Date(),
        completedById: userId,
      },
    });
  }

  unlockPhaseSteps(productionOrderId: string, phase: ComponentPhase) {
    return this.prisma.productionOrderStep.updateMany({
      where: {
        status: ProductionStepStatus.BLOCKED,
        component: { productionOrderId, phase },
      },
      data: { status: ProductionStepStatus.PENDING },
    });
  }

  updateOrderStatus(id: string, status: ProductionOrderStatus) {
    return this.prisma.productionOrder.update({ where: { id }, data: { status } });
  }
}
