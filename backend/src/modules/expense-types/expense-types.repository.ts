import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ExpenseTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Expense Types ────────────────────────────────────────────────────────

  async findAllTypes() {
    return this.prisma.expenseType.findMany({
      where: { isActive: true },
      include: {
        subcategories: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findTypeById(id: string) {
    return this.prisma.expenseType.findUnique({
      where: { id },
      include: {
        subcategories: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });
  }

  /** Todos los tipos, activos e inactivos: la unicidad del nombre los cubre a ambos. */
  async findAllTypeNames() {
    return this.prisma.expenseType.findMany({
      select: { id: true, name: true, isActive: true },
    });
  }

  async createType(data: { name: string; description?: string }) {
    return this.prisma.expenseType.create({ data });
  }

  async updateType(id: string, data: { name?: string; description?: string; isActive?: boolean }) {
    return this.prisma.expenseType.update({ where: { id }, data });
  }

  async deleteType(id: string) {
    return this.prisma.expenseType.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ─── Expense Subcategories ─────────────────────────────────────────────────

  async findAllSubcategories(expenseTypeId?: string) {
    return this.prisma.expenseSubcategory.findMany({
      where: {
        isActive: true,
        ...(expenseTypeId ? { expenseTypeId } : {}),
      },
      include: {
        expenseType: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findSubcategoryById(id: string) {
    return this.prisma.expenseSubcategory.findUnique({
      where: { id },
      include: {
        expenseType: { select: { id: true, name: true } },
      },
    });
  }

  async createSubcategory(data: {
    expenseTypeId: string;
    name: string;
    description?: string;
  }) {
    return this.prisma.expenseSubcategory.create({
      data,
      include: {
        expenseType: { select: { id: true, name: true } },
      },
    });
  }

  async updateSubcategory(
    id: string,
    data: { expenseTypeId?: string; name?: string; description?: string; isActive?: boolean },
  ) {
    return this.prisma.expenseSubcategory.update({
      where: { id },
      data,
      include: {
        expenseType: { select: { id: true, name: true } },
      },
    });
  }

  async deleteSubcategory(id: string) {
    return this.prisma.expenseSubcategory.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
