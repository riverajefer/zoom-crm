import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateMachineDto, UpdateMachineDto } from './dto';
import { MachinesRepository } from './machines.repository';

@Injectable()
export class MachinesService {
  constructor(
    private readonly machinesRepository: MachinesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(includeInactive = false) {
    return this.machinesRepository.findAll(includeInactive);
  }

  async findOne(id: string) {
    const machine = await this.machinesRepository.findById(id);
    if (!machine) {
      throw new NotFoundException(`Máquina con ID ${id} no encontrada`);
    }
    return machine;
  }

  async create(dto: CreateMachineDto) {
    const name = dto.name.trim();
    await this.assertNameAvailable(name);
    await this.assertProductionAreaExists(dto.productionAreaId);

    return this.machinesRepository.create({
      name,
      description: dto.description?.trim() || null,
      productionAreaId: dto.productionAreaId ?? null,
    });
  }

  async update(id: string, dto: UpdateMachineDto) {
    await this.findOne(id);

    const name = dto.name?.trim();
    if (name) {
      await this.assertNameAvailable(name, id);
    }
    await this.assertProductionAreaExists(dto.productionAreaId);

    return this.machinesRepository.update(id, {
      ...(name !== undefined && { name }),
      ...(dto.description !== undefined && { description: dto.description.trim() || null }),
      ...(dto.productionAreaId !== undefined && { productionAreaId: dto.productionAreaId || null }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
  }

  /**
   * Se desactiva en vez de borrarse: los registros de tiempo viejos siguen
   * apuntando a la máquina.
   */
  async remove(id: string) {
    await this.findOne(id);
    await this.machinesRepository.update(id, { isActive: false });
    return { message: 'Máquina desactivada correctamente' };
  }

  private async assertNameAvailable(name: string, excludeId?: string) {
    const existing = await this.machinesRepository.findByName(name, excludeId);
    if (existing) {
      throw new BadRequestException(`Ya existe una máquina con el nombre "${existing.name}"`);
    }
  }

  private async assertProductionAreaExists(productionAreaId?: string | null) {
    if (!productionAreaId) return;
    const area = await this.prisma.productionArea.findUnique({
      where: { id: productionAreaId },
      select: { id: true },
    });
    if (!area) {
      throw new BadRequestException('El área de producción no existe');
    }
  }
}
