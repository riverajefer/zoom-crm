import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CashRegisterService } from './cash-register.service';
import { CashRegisterRepository } from './cash-register.repository';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

// Solo Zoom: los documentos nacen en la sede activa del request, que en un
// test unitario no existe (docs/PLAN_SEDES.md §2).
jest.mock('../../common/utils/location-context', () => ({
  ...jest.requireActual('../../common/utils/location-context'),
  requireActiveLocationId: jest.fn(() => 'loc-125'),
}));


const registerStub = (overrides: Record<string, any> = {}) => ({
  id: 'reg-1',
  name: 'Caja Principal',
  ...overrides,
});

describe('CashRegisterService', () => {
  let service: CashRegisterService;
  let repository: any;
  let audit: { logCreate: jest.Mock; logUpdate: jest.Mock; logDelete: jest.Mock };

  beforeEach(async () => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      hasOpenSessions: jest.fn(),
    };
    audit = {
      logCreate: jest.fn().mockResolvedValue(undefined),
      logUpdate: jest.fn().mockResolvedValue(undefined),
      logDelete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashRegisterService,
        { provide: CashRegisterRepository, useValue: repository },
        { provide: AuditLogsService, useValue: audit },
      ],
    }).compile();

    service = module.get<CashRegisterService>(CashRegisterService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('delega en el repositorio', async () => {
      repository.findAll.mockResolvedValue([registerStub()]);
      await expect(service.findAll()).resolves.toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('devuelve la caja cuando existe', async () => {
      repository.findById.mockResolvedValue(registerStub());
      await expect(service.findOne('reg-1')).resolves.toEqual(registerStub());
    });

    it('lanza NotFound cuando no existe', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto = { name: 'Caja Principal' } as any;

    it('rechaza un nombre duplicado', async () => {
      repository.findByName.mockResolvedValue(registerStub());
      await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('crea la caja cuando el nombre es único', async () => {
      repository.findByName.mockResolvedValue(null);
      repository.create.mockResolvedValue(registerStub({ id: 'reg-new' }));
      const result = await service.create(dto, 'user-1');
      expect(result.id).toBe('reg-new');
      expect(repository.create).toHaveBeenCalledWith(dto, 'loc-125');
    });
  });

  describe('update', () => {
    it('lanza NotFound si la caja no existe', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.update('reg-1', { name: 'X' } as any, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza si el nuevo nombre ya existe en otra caja', async () => {
      repository.findById.mockResolvedValue(registerStub());
      repository.findByName.mockResolvedValue(registerStub({ id: 'reg-2' }));
      await expect(
        service.update('reg-1', { name: 'Caja Secundaria' } as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('actualiza cuando el nombre no cambia', async () => {
      repository.findById.mockResolvedValue(registerStub());
      repository.update.mockResolvedValue(registerStub({ name: 'Caja Principal', notes: 'x' }));
      await service.update('reg-1', { notes: 'x' } as any, 'user-1');
      expect(repository.findByName).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith('reg-1', { notes: 'x' });
    });
  });

  describe('remove', () => {
    it('lanza NotFound si la caja no existe', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.remove('reg-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la caja tiene sesiones abiertas', async () => {
      repository.findById.mockResolvedValue(registerStub());
      repository.hasOpenSessions.mockResolvedValue(true);
      await expect(service.remove('reg-1', 'user-1')).rejects.toThrow(/sesiones abiertas/);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('elimina la caja cuando no hay sesiones abiertas', async () => {
      repository.findById.mockResolvedValue(registerStub());
      repository.hasOpenSessions.mockResolvedValue(false);
      repository.delete.mockResolvedValue(undefined);
      const result = await service.remove('reg-1', 'user-1');
      expect(repository.delete).toHaveBeenCalledWith('reg-1');
      expect(result).toEqual({ message: 'Caja registradora eliminada correctamente' });
    });
  });
});
