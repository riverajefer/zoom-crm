import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseTypesRepository } from './expense-types.repository';
import { normName } from '../../common/utils/normalize.util';
import { isUniqueViolationOn } from '../../common/utils/unique-violation.util';
import {
  CreateExpenseTypeDto,
  UpdateExpenseTypeDto,
  CreateExpenseSubcategoryDto,
  UpdateExpenseSubcategoryDto,
} from './dto';

@Injectable()
export class ExpenseTypesService {
  constructor(private readonly repository: ExpenseTypesRepository) {}

  // ─── Expense Types ────────────────────────────────────────────────────────

  async findAllTypes() {
    return this.repository.findAllTypes();
  }

  async findOneType(id: string) {
    const type = await this.repository.findTypeById(id);
    if (!type) {
      throw new NotFoundException(`Tipo de gasto con id ${id} no encontrado`);
    }
    return type;
  }

  /**
   * Si el nombre coincide con un tipo eliminado (soft delete), se reactiva ese
   * en vez de crear otro: la base no admitiría el segundo y, desde la pantalla,
   * no hay otra forma de recuperar un tipo eliminado.
   */
  async createType(dto: CreateExpenseTypeDto) {
    const name = this.cleanName(dto.name);
    const twin = await this.findTypeWithSameName(name);

    if (twin?.isActive) {
      throw new ConflictException(`Ya existe el tipo de gasto «${twin.name}»`);
    }
    if (twin) {
      return this.saveType(() =>
        this.repository.updateType(twin.id, {
          name,
          description: dto.description,
          isActive: true,
        }),
      );
    }
    return this.saveType(() => this.repository.createType({ ...dto, name }));
  }

  async updateType(id: string, dto: UpdateExpenseTypeDto) {
    await this.findOneType(id);

    if (dto.name === undefined) {
      return this.saveType(() => this.repository.updateType(id, dto));
    }

    const name = this.cleanName(dto.name);
    const twin = await this.findTypeWithSameName(name, id);
    if (twin) {
      throw new ConflictException(
        twin.isActive
          ? `Ya existe el tipo de gasto «${twin.name}»`
          : `Ya existe el tipo de gasto «${twin.name}», que fue eliminado`,
      );
    }
    return this.saveType(() => this.repository.updateType(id, { ...dto, name }));
  }

  async removeType(id: string) {
    await this.findOneType(id);
    return this.repository.deleteType(id);
  }

  /**
   * Dos tipos son el mismo si coinciden sin mayúsculas, tildes ni espacios:
   * así nacieron «PRODUCCIÓN» y «PRODUCCION», que en producción partieron en
   * dos las OG y CP de una misma categoría.
   */
  private async findTypeWithSameName(name: string, excludeId?: string) {
    const key = normName(name);
    const types = await this.repository.findAllTypeNames();
    return types.find((t) => t.id !== excludeId && normName(t.name) === key) ?? null;
  }

  private cleanName(name: string) {
    const trimmed = name.trim();
    if (!normName(trimmed)) {
      throw new BadRequestException('El nombre del tipo de gasto debe tener letras o números');
    }
    return trimmed;
  }

  /**
   * La validación previa es un check-then-act: dos guardados simultáneos pasan
   * los dos. El que pierde choca contra `expense_types_name_normalized_unique`
   * (o el UNIQUE exacto `expense_types_name_key`) y aquí se vuelve un 409.
   */
  private async saveType<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (error) {
      if (isUniqueViolationOn(error, 'expense_types_name')) {
        throw new ConflictException('Ya existe un tipo de gasto con ese nombre');
      }
      throw error;
    }
  }

  // ─── Expense Subcategories ─────────────────────────────────────────────────

  async findAllSubcategories(expenseTypeId?: string) {
    if (expenseTypeId) {
      await this.findOneType(expenseTypeId);
    }
    return this.repository.findAllSubcategories(expenseTypeId);
  }

  async findOneSubcategory(id: string) {
    const sub = await this.repository.findSubcategoryById(id);
    if (!sub) {
      throw new NotFoundException(`Subcategoría con id ${id} no encontrada`);
    }
    return sub;
  }

  async createSubcategory(dto: CreateExpenseSubcategoryDto) {
    await this.findOneType(dto.expenseTypeId);
    return this.repository.createSubcategory(dto);
  }

  async updateSubcategory(id: string, dto: UpdateExpenseSubcategoryDto) {
    await this.findOneSubcategory(id);
    if (dto.expenseTypeId) {
      await this.findOneType(dto.expenseTypeId);
    }
    return this.repository.updateSubcategory(id, dto);
  }

  async removeSubcategory(id: string) {
    await this.findOneSubcategory(id);
    return this.repository.deleteSubcategory(id);
  }
}
