import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceRepository } from './attendance.repository';
import { PrismaService } from '../../database/prisma.service';
import { AttendanceSource } from '../../generated/prisma';

describe('AttendanceRepository', () => {
  let repository: AttendanceRepository;
  let prisma: any;

  const mockPrisma = {
    attendanceRecord: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    activityHeartbeat: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<AttendanceRepository>(AttendanceRepository);
    prisma = module.get(PrismaService);
  });

  describe('findActiveRecord', () => {
    it('should find first active record for user', async () => {
      prisma.attendanceRecord.findFirst.mockResolvedValue({ id: 'active-1' } as any);
      const result = await repository.findActiveRecord('user-1');
      expect(result).toEqual({ id: 'active-1' });
      expect(prisma.attendanceRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1', clockOut: null },
      }));
    });
  });

  describe('createClockIn', () => {
    it('should create attendance record', async () => {
      prisma.attendanceRecord.create.mockResolvedValue({ id: 'new-1' } as any);
      const now = new Date();
      const result = await repository.createClockIn('user-1', now);
      expect(result).toEqual({ id: 'new-1' });
      expect(prisma.attendanceRecord.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          clockIn: now,
          source: AttendanceSource.BUTTON,
        }),
      }));
    });
  });

  describe('updateClockOut', () => {
    it('should update attendance clock out', async () => {
      const now = new Date();
      prisma.attendanceRecord.update.mockResolvedValue({ id: 'updated-1' } as any);
      prisma.attendanceRecord.findUnique.mockResolvedValue({ clockIn: new Date(now.getTime() - 60000) } as any);
      const result = await repository.updateClockOut('id-1', now, AttendanceSource.SYSTEM, 'notes test');
      expect(result).toEqual({ id: 'updated-1' });
      expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'id-1' },
      }));
    });
  });

  describe('findMyRecords', () => {
    it('should find records with pagination and filters', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([
        { id: '1' },
        { id: '2' },
      ] as any);
      prisma.attendanceRecord.count.mockResolvedValue(2);

      const result = await repository.findMyRecords('u-1', { page: 1, limit: 10, startDate: '2026-03-01', endDate: '2026-03-10' });
      
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(prisma.attendanceRecord.findMany).toHaveBeenCalled();
      expect(prisma.attendanceRecord.count).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should find all with pagination and related user', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([ { id: 'a' } ] as any);
      prisma.attendanceRecord.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 2, limit: 15, userId: 'some-user' });
      
      expect(result.data).toHaveLength(1);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(15);
      expect(prisma.attendanceRecord.findMany).toHaveBeenCalled();
    });
  });

  describe('adjustRecord', () => {
    it('should update specific fields', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({ clockIn: new Date(), clockOut: new Date() } as any);
      prisma.attendanceRecord.update.mockResolvedValue({ id: 'adj-1' } as any);
      const date = new Date().toISOString();
      await repository.adjustRecord('adj-1', { clockIn: date, reason: 'admin fix' });
      expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'adj-1' },
      }));
    });
  });

  describe('createHeartbeat', () => {
    it('should insert into UserActivityLog', async () => {
      prisma.activityHeartbeat.create.mockResolvedValue({} as any);
      await repository.createHeartbeat('u2', '/home');
      expect(prisma.activityHeartbeat.create).toHaveBeenCalledWith({
        data: { userId: 'u2', endpoint: '/home' },
      });
    });
  });

  describe('findOpenRecordsInactiveFor', () => {
    it('should return records matching conditions', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([{ id: 'r1', userId: 'u1' }] as any[]);
      prisma.activityHeartbeat.findFirst.mockResolvedValue({ timestamp: new Date(Date.now() - 60 * 60000) } as any);
      const res = await repository.findOpenRecordsInactiveFor(30);
      expect(res).toHaveLength(1);
    });

    it('no considera a quien tiene una tarea del temporizador en curso', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([] as any[]);
      await repository.findOpenRecordsInactiveFor(60);
      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clockOut: null,
            user: { workOrderTimeEntries: { none: { entryType: 'TIMER', endAt: null, voidedAt: null } } },
          },
        }),
      );
    });
  });

  describe('findAllOpenRecords', () => {
    it('should find many where clockOut is null', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([{ id: 'r1' }] as any[]);
      const res = await repository.findAllOpenRecords();
      expect(res).toHaveLength(1);
      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clockOut: null } }));
    });
  });

  describe('deleteOldHeartbeats', () => {
    it('should delete many user heartbeats', async () => {
      const now = new Date();
      prisma.activityHeartbeat.deleteMany.mockResolvedValue({ count: 99 } as any);
      const res = await repository.deleteOldHeartbeats(now);
      expect(res.count).toBe(99);
      expect(prisma.activityHeartbeat.deleteMany).toHaveBeenCalled();
    });
  });
});
