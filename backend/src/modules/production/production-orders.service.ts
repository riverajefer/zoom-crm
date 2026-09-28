import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { ProductionRepository } from './production.repository';
import { CreateProductionOrderDto, FilterProductionOrdersDto } from './dto';
import { ComponentPhase, ProductionOrderStatus, ProductionStepStatus } from '../../generated/prisma';

interface FieldDef {
  key: string;
  label: string;
  type: string;
  stage: 'specification' | 'execution';
  required: boolean;
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly repo: ProductionRepository,
    private readonly prisma: PrismaService,
    private readonly consecutivesService: ConsecutivesService,
  ) {}

  async findAll(filters: FilterProductionOrdersDto) {
    const [orders, total] = await this.repo.findAllOrders({
      status: filters.status,
      search: filters.search,
      workOrderId: filters.workOrderId,
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
    });

    return {
      data: orders,
      meta: {
        total,
        page: filters.page ?? 1,
        limit: filters.limit ?? 20,
        totalPages: Math.ceil(total / (filters.limit ?? 20)),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.repo.findOrderById(id);
    if (!order) throw new NotFoundException(`Orden de producción con id ${id} no encontrada`);

    // Calculate progress per component and total
    const components = (order.components as any[]).map((comp) => {
      const steps = comp.steps as any[];
      const totalSteps = steps.length;
      const completedSteps = steps.filter((s) =>
        [ProductionStepStatus.COMPLETED, ProductionStepStatus.SKIPPED].includes(s.status),
      ).length;
      return {
        ...comp,
        progress: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
      };
    });

    const allSteps = components.flatMap((c) => c.steps as any[]);
    const totalSteps = allSteps.length;
    const completedSteps = allSteps.filter((s) =>
      [ProductionStepStatus.COMPLETED, ProductionStepStatus.SKIPPED].includes(s.status),
    ).length;

    return {
      ...order,
      components,
      progress: {
        total: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
        completedSteps,
        totalSteps,
      },
    };
  }

  async getProgress(id: string) {
    const order = await this.findOne(id);
    return order.progress;
  }

  async create(dto: CreateProductionOrderDto, userId: string) {
    // Verify WorkOrder exists
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: dto.workOrderId },
    });
    if (!workOrder) throw new NotFoundException(`WorkOrder con id ${dto.workOrderId} no encontrada`);

    // Verify template exists
    const template = await this.repo.findTemplateWithComponents(dto.templateId);
    if (!template) throw new NotFoundException(`Plantilla con id ${dto.templateId} no encontrada`);
    if (!template.isActive) throw new BadRequestException('La plantilla está desactivada');

    // La OPROD hereda la sede de su OT, que la hereda de la OP (docs/PLAN_SEDES.md §2).
    const oprodNumber = await this.consecutivesService.generateNumber('PRODUCTION_ORDER', workOrder.locationId);

    // Create everything in a transaction
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.create({
        data: {
          oprodNumber,
          locationId: workOrder.locationId,
          templateId: dto.templateId,
          workOrderId: dto.workOrderId,
          notes: dto.notes,
          createdById: userId,
          status: ProductionOrderStatus.PENDING,
        },
      });

      for (const component of template.components) {
        const isBlockedPhase =
          component.phase === ComponentPhase.armado || component.phase === ComponentPhase.despacho;

        const comp = await tx.productionOrderComponent.create({
          data: {
            productionOrderId: order.id,
            name: component.name,
            order: component.order,
            phase: component.phase,
          },
        });

        for (const step of component.steps) {
          await tx.productionOrderStep.create({
            data: {
              componentId: comp.id,
              stepDefinitionId: step.stepDefinitionId,
              order: step.order,
              status: isBlockedPhase ? ProductionStepStatus.BLOCKED : ProductionStepStatus.PENDING,
              fieldValues: { specification: {}, execution: {} },
            },
          });
        }
      }

      return tx.productionOrder.update({
        where: { id: order.id },
        data: { status: ProductionOrderStatus.IN_PROGRESS },
      });
    });
  }

  async updateSpecification(orderId: string, stepId: string, data: Record<string, any>) {
    const step = await this.repo.findStepById(stepId);
    if (!step) throw new NotFoundException(`Paso con id ${stepId} no encontrado`);
    if (step.component.productionOrderId !== orderId)
      throw new ForbiddenException('El paso no pertenece a esta orden de producción');
    if (step.status === ProductionStepStatus.COMPLETED)
      throw new BadRequestException('No se puede modificar un paso completado');

    const currentValues = step.fieldValues as any;
    const updatedFieldValues = {
      specification: { ...(currentValues.specification || {}), ...data },
      execution: currentValues.execution || {},
    };

    return this.prisma.productionOrderStep.update({
      where: { id: stepId },
      data: { fieldValues: updatedFieldValues },
    });
  }

  async updateExecution(orderId: string, stepId: string, data: Record<string, any>) {
    const step = await this.repo.findStepById(stepId);
    if (!step) throw new NotFoundException(`Paso con id ${stepId} no encontrado`);
    if (step.component.productionOrderId !== orderId)
      throw new ForbiddenException('El paso no pertenece a esta orden de producción');
    if (step.status === ProductionStepStatus.COMPLETED)
      throw new BadRequestException('No se puede modificar un paso completado');
    if (step.status === ProductionStepStatus.BLOCKED)
      throw new BadRequestException('El paso está bloqueado. Completa los componentes previos primero');

    // Mark IN_PROGRESS if currently PENDING
    const currentValues = step.fieldValues as any;
    const updatedFieldValues = {
      specification: currentValues.specification || {},
      execution: { ...(currentValues.execution || {}), ...data },
    };

    return this.prisma.productionOrderStep.update({
      where: { id: stepId },
      data: {
        fieldValues: updatedFieldValues,
        status:
          step.status === ProductionStepStatus.PENDING
            ? ProductionStepStatus.IN_PROGRESS
            : step.status,
      },
    });
  }

  async completeStep(orderId: string, stepId: string, userId: string) {
    const step = await this.repo.findStepById(stepId);
    if (!step) throw new NotFoundException(`Paso con id ${stepId} no encontrado`);
    if (step.component.productionOrderId !== orderId)
      throw new ForbiddenException('El paso no pertenece a esta orden de producción');
    if (step.status === ProductionStepStatus.COMPLETED)
      throw new BadRequestException('El paso ya está completado');
    if (step.status === ProductionStepStatus.BLOCKED)
      throw new BadRequestException('El paso está bloqueado');

    // Validate required execution fields
    this.validateRequiredExecutionFields(step);

    // Check sequential constraint: previous step must be COMPLETED or SKIPPED
    if (step.order > 1) {
      const prevStep = await this.prisma.productionOrderStep.findFirst({
        where: { componentId: step.componentId, order: step.order - 1 },
        select: { status: true },
      });
      if (
        prevStep &&
        prevStep.status !== ProductionStepStatus.COMPLETED &&
        prevStep.status !== ProductionStepStatus.SKIPPED
      ) {
        throw new BadRequestException('El paso anterior debe completarse primero');
      }
    }

    await this.repo.completeStep(stepId, userId);

    // Try to unlock next phase
    await this.tryUnlockNextPhase(orderId, step.component.phase);

    // Check if entire order is complete
    await this.checkAndCompleteOrder(orderId);

    return this.repo.findStepById(stepId);
  }

  private validateRequiredExecutionFields(step: any) {
    const schema = step.stepDefinition.fieldSchema as { fields: FieldDef[] };
    const executionRequired = schema.fields.filter((f) => f.stage === 'execution' && f.required);
    const execValues = ((step.fieldValues as any).execution || {}) as Record<string, any>;

    const missing = executionRequired.filter((f) => {
      const val = execValues[f.key];
      return val === undefined || val === null || val === '';
    });

    if (missing.length > 0) {
      throw new BadRequestException(
        `Campos de ejecución requeridos sin completar: ${missing.map((f) => f.label).join(', ')}`,
      );
    }
  }

  private async tryUnlockNextPhase(orderId: string, currentPhase: ComponentPhase) {
    const order = await this.repo.findOrderWithComponents(orderId);
    if (!order) return;

    if (currentPhase === ComponentPhase.armado) {
      const armadoComponents = order.components.filter((c) => c.phase === ComponentPhase.armado);
      const allDone = armadoComponents.every((c) =>
        c.steps.every(
          (s) => s.status === ProductionStepStatus.COMPLETED || s.status === ProductionStepStatus.SKIPPED,
        ),
      );
      if (allDone) await this.repo.unlockPhaseSteps(orderId, ComponentPhase.despacho);
    } else if (
      currentPhase === ComponentPhase.impresion ||
      currentPhase === ComponentPhase.material
    ) {
      const parallelComponents = order.components.filter(
        (c) => c.phase === ComponentPhase.impresion || c.phase === ComponentPhase.material,
      );
      const allDone = parallelComponents.every((c) =>
        c.steps.every(
          (s) => s.status === ProductionStepStatus.COMPLETED || s.status === ProductionStepStatus.SKIPPED,
        ),
      );
      if (allDone) await this.repo.unlockPhaseSteps(orderId, ComponentPhase.armado);
    }
  }

  private async checkAndCompleteOrder(orderId: string) {
    const order = await this.repo.findOrderWithComponents(orderId);
    if (!order) return;

    const allDone = order.components.every((c) =>
      c.steps.every(
        (s) => s.status === ProductionStepStatus.COMPLETED || s.status === ProductionStepStatus.SKIPPED,
      ),
    );
    if (allDone) {
      await this.repo.updateOrderStatus(orderId, ProductionOrderStatus.COMPLETED);
    }
  }
}
