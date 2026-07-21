import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { DataExportService } from './data-export.service.js';

describe('DataExportService', () => {
  let service: DataExportService;

  const mockPrismaService = {
    dataExportRequest: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockUsersQueue = {
    add: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: getQueueToken('users-processing'),
          useValue: mockUsersQueue,
        },
      ],
    }).compile();

    service = module.get<DataExportService>(DataExportService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestDataExport', () => {
    it('should create data export request and enqueue job', async () => {
      mockPrismaService.dataExportRequest.create.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'PENDING',
      });

      const result = await service.requestDataExport('user-1');

      expect(mockPrismaService.dataExportRequest.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          status: 'PENDING',
        },
      });
      expect(mockUsersQueue.add).toHaveBeenCalledWith('export-data', {
        requestId: 'export-1',
        userId: 'user-1',
      });
      expect(result).toEqual({
        message: 'Data export request has been queued.',
        requestId: 'export-1',
      });
    });
  });

  describe('getExportHistory', () => {
    it('should return recent export history for user', async () => {
      mockPrismaService.dataExportRequest.findMany.mockResolvedValue([
        { id: 'export-1', userId: 'user-1', status: 'COMPLETED' },
      ]);

      const result = await service.getExportHistory('user-1');
      expect(result).toHaveLength(1);
    });
  });
});
