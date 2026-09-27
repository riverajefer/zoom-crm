import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateSedeDto, UpdateSedeDto } from './dto';
import { SedesRepository } from './sedes.repository';

/**
 * Sedes de Zoom: los locales 104, 119 y 125, y la Matriz.
 * Crearlas y editarlas es solo de soporte (permiso reservado `manage_locations`).
 * Ver docs/PLAN_SEDES.md §6.4.
 */
@Injectable()
export class SedesService {
  constructor(private readonly sedesRepository: SedesRepository) {}

  async findAll(includeInactive = false) {
    return this.sedesRepository.findAll(includeInactive);
  }

  async findOne(id: string) {
    const sede = await this.sedesRepository.findById(id);
    if (!sede) {
      throw new NotFoundException(`Sede con ID ${id} no encontrada`);
    }
    return sede;
  }

  async create(dto: CreateSedeDto) {
    if (await this.sedesRepository.findByCode(dto.code)) {
      throw new BadRequestException(`Ya existe una sede con el código «${dto.code}»`);
    }
    return this.sedesRepository.create({
      code: dto.code,
      name: dto.name.trim(),
      type: dto.type,
      address: dto.address?.trim() || null,
      phone: dto.phone?.trim() || null,
      color: dto.color,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });
  }

  async update(id: string, dto: UpdateSedeDto) {
    await this.findOne(id);
    return this.sedesRepository.update(id, {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.address !== undefined && { address: dto.address?.trim() || null }),
      ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
      ...(dto.color !== undefined && { color: dto.color }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
  }
}
