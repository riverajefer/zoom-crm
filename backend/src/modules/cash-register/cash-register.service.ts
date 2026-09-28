import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashRegisterRepository } from './cash-register.repository';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateCashRegisterDto, UpdateCashRegisterDto } from './dto';
import { requireActiveLocationId } from '../../common/utils/location-context';

@Injectable()
export class CashRegisterService {
  constructor(
    private readonly repository: CashRegisterRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll() {
    return this.repository.findAll();
  }

  async findOne(id: string) {
    const register = await this.repository.findById(id);
    if (!register) {
      throw new NotFoundException(`Caja registradora con id ${id} no encontrada`);
    }
    return register;
  }

  async create(dto: CreateCashRegisterDto, userId: string) {
    const existing = await this.repository.findByName(dto.name);
    if (existing) {
      throw new BadRequestException(
        `Ya existe una caja registradora con el nombre "${dto.name}"`,
      );
    }

    // La caja pertenece a la sede activa (docs/PLAN_SEDES.md §4). La fase 3
    // deja una caja por sede.
    const register = await this.repository.create(dto, requireActiveLocationId());

    setImmediate(() => {
      this.auditLogsService
        .logCreate('CashRegister', register.id, register, userId)
        .catch(() => {});
    });

    return register;
  }

  async update(id: string, dto: UpdateCashRegisterDto, userId: string) {
    const register = await this.repository.findById(id);
    if (!register) {
      throw new NotFoundException(`Caja registradora con id ${id} no encontrada`);
    }

    if (dto.name && dto.name !== register.name) {
      const existing = await this.repository.findByName(dto.name);
      if (existing) {
        throw new BadRequestException(
          `Ya existe una caja registradora con el nombre "${dto.name}"`,
        );
      }
    }

    const updated = await this.repository.update(id, dto);

    setImmediate(() => {
      this.auditLogsService
        .logUpdate('CashRegister', id, register, updated, userId)
        .catch(() => {});
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const register = await this.repository.findById(id);
    if (!register) {
      throw new NotFoundException(`Caja registradora con id ${id} no encontrada`);
    }

    const hasOpen = await this.repository.hasOpenSessions(id);
    if (hasOpen) {
      throw new BadRequestException(
        'No se puede eliminar una caja que tiene sesiones abiertas',
      );
    }

    await this.repository.delete(id);

    setImmediate(() => {
      this.auditLogsService
        .logDelete('CashRegister', id, register, userId)
        .catch(() => {});
    });

    return { message: 'Caja registradora eliminada correctamente' };
  }
}
