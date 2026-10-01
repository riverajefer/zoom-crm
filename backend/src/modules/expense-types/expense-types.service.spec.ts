import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ExpenseTypesService } from './expense-types.service';
import { ExpenseTypesRepository } from './expense-types.repository';

const mockRepository = {
  findAllTypes: jest.fn(),
  findTypeById: jest.fn(),
  findAllTypeNames: jest.fn(),
  createType: jest.fn(),
  updateType: jest.fn(),
  deleteType: jest.fn(),
  findAllSubcategories: jest.fn(),
  findSubcategoryById: jest.fn(),
  createSubcategory: jest.fn(),
  updateSubcategory: jest.fn(),
  deleteSubcategory: jest.fn(),
};

const TYPE_ID = 'type-1';
const SUB_ID = 'sub-1';

const mockType = {
  id: TYPE_ID,
  name: 'Materiales',
  description: 'Gastos de materiales',
  isActive: true,
  subcategories: [],
};

const mockSubcategory = {
  id: SUB_ID,
  expenseTypeId: TYPE_ID,
  name: 'Madera',
  description: null,
  isActive: true,
  expenseType: { id: TYPE_ID, name: 'Materiales' },
};

describe('ExpenseTypesService', () => {
  let service: ExpenseTypesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseTypesService,
        { provide: ExpenseTypesRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ExpenseTypesService>(ExpenseTypesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Expense Types ─────────────────────────────────────────────────────────

  describe('findAllTypes', () => {
    it('should return all types from repository', async () => {
      mockRepository.findAllTypes.mockResolvedValue([mockType]);

      const result = await service.findAllTypes();

      expect(result).toEqual([mockType]);
      expect(mockRepository.findAllTypes).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOneType', () => {
    it('should return type when found', async () => {
      mockRepository.findTypeById.mockResolvedValue(mockType);

      const result = await service.findOneType(TYPE_ID);

      expect(result).toEqual(mockType);
      expect(mockRepository.findTypeById).toHaveBeenCalledWith(TYPE_ID);
    });

    it('should throw NotFoundException when type does not exist', async () => {
      mockRepository.findTypeById.mockResolvedValue(null);

      await expect(service.findOneType('bad-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOneType('bad-id')).rejects.toThrow(
        'Tipo de gasto con id bad-id no encontrado',
      );
    });
  });

  describe('createType', () => {
    beforeEach(() => mockRepository.findAllTypeNames.mockResolvedValue([]));

    it('should delegate creation to repository', async () => {
      const dto = { name: 'Servicios', description: 'Servicios externos' };
      mockRepository.createType.mockResolvedValue({ id: 'new-id', ...dto });

      await service.createType(dto);

      expect(mockRepository.createType).toHaveBeenCalledWith(dto);
    });

    it('guarda el nombre sin espacios sobrantes', async () => {
      await service.createType({ name: '  Servicios  ' });

      expect(mockRepository.createType).toHaveBeenCalledWith({ name: 'Servicios' });
    });

    it.each(['PRODUCCION', 'Producción', 'producción ', 'PRODUCCIÓN'])(
      'rechaza «%s» si ya existe «PRODUCCIÓN» activo',
      async (name) => {
        mockRepository.findAllTypeNames.mockResolvedValue([
          { id: 'prod', name: 'PRODUCCIÓN', isActive: true },
        ]);

        await expect(service.createType({ name })).rejects.toThrow(
          new ConflictException('Ya existe el tipo de gasto «PRODUCCIÓN»'),
        );
        expect(mockRepository.createType).not.toHaveBeenCalled();
      },
    );

    it('reactiva el tipo eliminado con el mismo nombre en vez de crear otro', async () => {
      mockRepository.findAllTypeNames.mockResolvedValue([
        { id: 'prod', name: 'PRODUCCION', isActive: false },
      ]);

      await service.createType({ name: 'Producción', description: 'Nueva' });

      expect(mockRepository.createType).not.toHaveBeenCalled();
      expect(mockRepository.updateType).toHaveBeenCalledWith('prod', {
        name: 'Producción',
        description: 'Nueva',
        isActive: true,
      });
    });

    it('rechaza un nombre sin letras ni números', async () => {
      await expect(service.createType({ name: ' -- ' })).rejects.toThrow(BadRequestException);
      expect(mockRepository.createType).not.toHaveBeenCalled();
    });

    // Dos guardados simultáneos pasan la validación; el perdedor choca contra
    // el índice. Forma real del error con el adaptador `PrismaPg`: `meta.target`
    // vacío y el nombre del índice en `meta.driverAdapterError`.
    it('convierte el choque contra el índice normalizado en un 409', async () => {
      mockRepository.createType.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
          meta: {
            driverAdapterError: {
              cause: {
                originalMessage:
                  'duplicate key value violates unique constraint "expense_types_name_normalized_unique"',
              },
            },
          },
        }),
      );

      await expect(service.createType({ name: 'Producción' })).rejects.toThrow(
        new ConflictException('Ya existe un tipo de gasto con ese nombre'),
      );
    });

    it('no confunde otros errores con un nombre duplicado', async () => {
      const boom = new Error('connection lost');
      mockRepository.createType.mockRejectedValue(boom);

      await expect(service.createType({ name: 'Producción' })).rejects.toBe(boom);
    });
  });

  describe('updateType', () => {
    beforeEach(() => {
      mockRepository.findTypeById.mockResolvedValue(mockType);
      mockRepository.findAllTypeNames.mockResolvedValue([
        { id: TYPE_ID, name: 'Materiales', isActive: true },
      ]);
    });

    it('should validate existence then update', async () => {
      const dto = { name: 'Materiales Actualizado' };
      mockRepository.updateType.mockResolvedValue({ ...mockType, ...dto });

      await service.updateType(TYPE_ID, dto);

      expect(mockRepository.findTypeById).toHaveBeenCalledWith(TYPE_ID);
      expect(mockRepository.updateType).toHaveBeenCalledWith(TYPE_ID, dto);
    });

    it('permite cambiar solo mayúsculas o tildes del propio tipo', async () => {
      await service.updateType(TYPE_ID, { name: 'MATERIALES' });

      expect(mockRepository.updateType).toHaveBeenCalledWith(TYPE_ID, { name: 'MATERIALES' });
    });

    it('rechaza renombrar a un nombre que ya usa otro tipo', async () => {
      mockRepository.findAllTypeNames.mockResolvedValue([
        { id: TYPE_ID, name: 'Materiales', isActive: true },
        { id: 'prod', name: 'PRODUCCIÓN', isActive: true },
      ]);

      await expect(service.updateType(TYPE_ID, { name: 'produccion' })).rejects.toThrow(
        new ConflictException('Ya existe el tipo de gasto «PRODUCCIÓN»'),
      );
      expect(mockRepository.updateType).not.toHaveBeenCalled();
    });

    it('avisa cuando el nombre lo tiene un tipo eliminado', async () => {
      mockRepository.findAllTypeNames.mockResolvedValue([
        { id: TYPE_ID, name: 'Materiales', isActive: true },
        { id: 'old', name: 'PRODUCCION', isActive: false },
      ]);

      await expect(service.updateType(TYPE_ID, { name: 'Producción' })).rejects.toThrow(
        new ConflictException('Ya existe el tipo de gasto «PRODUCCION», que fue eliminado'),
      );
    });

    it('no consulta nombres si el nombre no cambia', async () => {
      await service.updateType(TYPE_ID, { description: 'otra' });

      expect(mockRepository.findAllTypeNames).not.toHaveBeenCalled();
      expect(mockRepository.updateType).toHaveBeenCalledWith(TYPE_ID, { description: 'otra' });
    });

    it('should throw NotFoundException when type does not exist', async () => {
      mockRepository.findTypeById.mockResolvedValue(null);

      await expect(service.updateType('bad-id', { name: 'x' })).rejects.toThrow(NotFoundException);
      expect(mockRepository.updateType).not.toHaveBeenCalled();
    });
  });

  describe('removeType', () => {
    it('should validate existence then delete', async () => {
      mockRepository.findTypeById.mockResolvedValue(mockType);
      mockRepository.deleteType.mockResolvedValue({ ...mockType, isActive: false });

      await service.removeType(TYPE_ID);

      expect(mockRepository.findTypeById).toHaveBeenCalledWith(TYPE_ID);
      expect(mockRepository.deleteType).toHaveBeenCalledWith(TYPE_ID);
    });

    it('should throw NotFoundException when type does not exist', async () => {
      mockRepository.findTypeById.mockResolvedValue(null);

      await expect(service.removeType('bad-id')).rejects.toThrow(NotFoundException);
      expect(mockRepository.deleteType).not.toHaveBeenCalled();
    });
  });

  // ─── Expense Subcategories ─────────────────────────────────────────────────

  describe('findAllSubcategories', () => {
    it('should return subcategories without filter', async () => {
      mockRepository.findAllSubcategories.mockResolvedValue([mockSubcategory]);

      const result = await service.findAllSubcategories();

      expect(result).toEqual([mockSubcategory]);
      expect(mockRepository.findAllSubcategories).toHaveBeenCalledWith(undefined);
    });

    it('should validate type existence when expenseTypeId is provided', async () => {
      mockRepository.findTypeById.mockResolvedValue(mockType);
      mockRepository.findAllSubcategories.mockResolvedValue([mockSubcategory]);

      await service.findAllSubcategories(TYPE_ID);

      expect(mockRepository.findTypeById).toHaveBeenCalledWith(TYPE_ID);
      expect(mockRepository.findAllSubcategories).toHaveBeenCalledWith(TYPE_ID);
    });

    it('should throw NotFoundException when filter type does not exist', async () => {
      mockRepository.findTypeById.mockResolvedValue(null);

      await expect(service.findAllSubcategories('bad-id')).rejects.toThrow(NotFoundException);
      expect(mockRepository.findAllSubcategories).not.toHaveBeenCalled();
    });
  });

  describe('findOneSubcategory', () => {
    it('should return subcategory when found', async () => {
      mockRepository.findSubcategoryById.mockResolvedValue(mockSubcategory);

      const result = await service.findOneSubcategory(SUB_ID);

      expect(result).toEqual(mockSubcategory);
    });

    it('should throw NotFoundException when subcategory does not exist', async () => {
      mockRepository.findSubcategoryById.mockResolvedValue(null);

      await expect(service.findOneSubcategory('bad-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOneSubcategory('bad-id')).rejects.toThrow(
        'Subcategoría con id bad-id no encontrada',
      );
    });
  });

  describe('createSubcategory', () => {
    it('should validate type existence then create subcategory', async () => {
      const dto = { expenseTypeId: TYPE_ID, name: 'Tornillos' };
      mockRepository.findTypeById.mockResolvedValue(mockType);
      mockRepository.createSubcategory.mockResolvedValue({ id: 'new-sub', ...dto });

      await service.createSubcategory(dto);

      expect(mockRepository.findTypeById).toHaveBeenCalledWith(TYPE_ID);
      expect(mockRepository.createSubcategory).toHaveBeenCalledWith(dto);
    });

    it('should throw NotFoundException when expense type does not exist', async () => {
      mockRepository.findTypeById.mockResolvedValue(null);

      await expect(
        service.createSubcategory({ expenseTypeId: 'bad-id', name: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepository.createSubcategory).not.toHaveBeenCalled();
    });
  });

  describe('updateSubcategory', () => {
    it('should update subcategory without changing expenseTypeId', async () => {
      mockRepository.findSubcategoryById.mockResolvedValue(mockSubcategory);
      const dto = { name: 'Madera Actualizada' };
      mockRepository.updateSubcategory.mockResolvedValue({ ...mockSubcategory, ...dto });

      await service.updateSubcategory(SUB_ID, dto);

      expect(mockRepository.findSubcategoryById).toHaveBeenCalledWith(SUB_ID);
      expect(mockRepository.findTypeById).not.toHaveBeenCalled();
      expect(mockRepository.updateSubcategory).toHaveBeenCalledWith(SUB_ID, dto);
    });

    it('should validate new expenseTypeId when provided', async () => {
      mockRepository.findSubcategoryById.mockResolvedValue(mockSubcategory);
      const newTypeId = 'type-2';
      mockRepository.findTypeById.mockResolvedValue({ id: newTypeId, name: 'Otro' });
      const dto = { expenseTypeId: newTypeId, name: 'Madera' };
      mockRepository.updateSubcategory.mockResolvedValue({ ...mockSubcategory, ...dto });

      await service.updateSubcategory(SUB_ID, dto);

      expect(mockRepository.findTypeById).toHaveBeenCalledWith(newTypeId);
      expect(mockRepository.updateSubcategory).toHaveBeenCalledWith(SUB_ID, dto);
    });

    it('should throw NotFoundException when subcategory does not exist', async () => {
      mockRepository.findSubcategoryById.mockResolvedValue(null);

      await expect(service.updateSubcategory('bad-id', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepository.updateSubcategory).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when new expenseTypeId does not exist', async () => {
      mockRepository.findSubcategoryById.mockResolvedValue(mockSubcategory);
      mockRepository.findTypeById.mockResolvedValue(null);

      await expect(
        service.updateSubcategory(SUB_ID, { expenseTypeId: 'bad-type' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepository.updateSubcategory).not.toHaveBeenCalled();
    });
  });

  describe('removeSubcategory', () => {
    it('should validate existence then delete subcategory', async () => {
      mockRepository.findSubcategoryById.mockResolvedValue(mockSubcategory);
      mockRepository.deleteSubcategory.mockResolvedValue({ ...mockSubcategory, isActive: false });

      await service.removeSubcategory(SUB_ID);

      expect(mockRepository.findSubcategoryById).toHaveBeenCalledWith(SUB_ID);
      expect(mockRepository.deleteSubcategory).toHaveBeenCalledWith(SUB_ID);
    });

    it('should throw NotFoundException when subcategory does not exist', async () => {
      mockRepository.findSubcategoryById.mockResolvedValue(null);

      await expect(service.removeSubcategory('bad-id')).rejects.toThrow(NotFoundException);
      expect(mockRepository.deleteSubcategory).not.toHaveBeenCalled();
    });
  });
});
