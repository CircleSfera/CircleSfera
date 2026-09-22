import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_LEASE_DURATION_MS,
  OUTBOX_MAX_RETRIES,
} from './outbox.constants.js';
import { OutboxService } from './outbox.service.js';

describe('OutboxService', () => {
  let service: OutboxService;

  const mockPrismaService = {
    outboxEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'bull-job-1' }),
  };

  const mockModuleRef = {
    get: vi.fn().mockImplementation((token: string) => {
      if (token === getQueueToken('users-processing')) {
        return mockQueue;
      }
      return null;
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ModuleRef, useValue: mockModuleRef },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueue', () => {
    it('should create outboxEvent record inside transaction', async () => {
      const mockTx = {
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
        },
      } as any;

      const result = await service.enqueue(mockTx, {
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: { requestId: 'req-1', userId: 'user-1' },
        options: { jobId: 'export:req-1', removeOnComplete: true },
      });

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          queueName: 'users-processing',
          eventName: 'export-data',
          payload: { requestId: 'req-1', userId: 'user-1' },
          options: { jobId: 'export:req-1', removeOnComplete: true },
          status: 'PENDING',
        },
      });
      expect(result).toEqual({ id: 'outbox-1' });
    });

    it('should default payload to empty object and options to null if omitted', async () => {
      const mockTx = {
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: 'outbox-2' }),
        },
      } as any;

      await service.enqueue(mockTx, {
        queueName: 'users-processing',
        eventName: 'simple-event',
      } as any);

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          queueName: 'users-processing',
          eventName: 'simple-event',
          payload: {},
          options: null,
          status: 'PENDING',
        },
      });
    });

    it('should throw if queueName or eventName is missing', async () => {
      const mockTx = { outboxEvent: { create: vi.fn() } } as any;

      await expect(
        service.enqueue(mockTx, {
          queueName: '',
          eventName: 'test',
          payload: {},
        }),
      ).rejects.toThrow('Outbox event requires queueName and eventName');

      await expect(
        service.enqueue(mockTx, {
          queueName: 'test',
          eventName: '',
          payload: {},
        }),
      ).rejects.toThrow('Outbox event requires queueName and eventName');
    });

    it('should return null and warn when tx delegate is missing or invalid', async () => {
      const mockTx = {} as any;
      const result = await service.enqueue(mockTx, {
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: {},
      });
      expect(result).toBeNull();
    });
  });

  describe('resolveQueue', () => {
    it('should resolve and cache registered queue', () => {
      const queue1 = service.resolveQueue('users-processing');
      expect(queue1).toBe(mockQueue);
      expect(mockModuleRef.get).toHaveBeenCalledWith(
        getQueueToken('users-processing'),
        { strict: false },
      );

      // Second call should hit internal cache
      const queue2 = service.resolveQueue('users-processing');
      expect(queue2).toBe(mockQueue);
      expect(mockModuleRef.get).toHaveBeenCalledTimes(1);
    });

    it('should return null for unregistered queue', () => {
      const queue = service.resolveQueue('non-existent-queue');
      expect(queue).toBeNull();
    });

    it('should return null and warn when moduleRef.get throws', () => {
      mockModuleRef.get.mockImplementationOnce(() => {
        throw new Error('ModuleRef failure');
      });
      const queue = service.resolveQueue('failing-queue');
      expect(queue).toBeNull();
    });

    it('should return null and warn when moduleRef.get throws non-Error', () => {
      mockModuleRef.get.mockImplementationOnce(() => {
        throw 'ModuleRef failure string';
      });
      const queue = service.resolveQueue('failing-queue-str');
      expect(queue).toBeNull();
    });
  });

  describe('publishPendingEvents', () => {
    it('should claim PENDING events and publish to BullMQ with deterministic jobId', async () => {
      const now = new Date();
      const mockEvent = {
        id: 'outbox-1',
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: { requestId: 'req-1', userId: 'user-1' },
        options: { jobId: 'export:req-1', removeOnComplete: true },
        status: 'PENDING',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      mockPrismaService.outboxEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaService.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.outboxEvent.update.mockResolvedValue({
        ...mockEvent,
        status: 'PUBLISHED',
      });

      const stats = await service.publishPendingEvents();

      expect(mockPrismaService.outboxEvent.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { status: 'PENDING' },
            {
              status: 'PROCESSING',
              updatedAt: {
                lte: expect.any(Date),
              },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: OUTBOX_BATCH_SIZE,
      });

      expect(mockPrismaService.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: 'PENDING',
          updatedAt: now,
        },
        data: {
          status: 'PROCESSING',
          updatedAt: expect.any(Date),
        },
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'export-data',
        { requestId: 'req-1', userId: 'user-1' },
        {
          jobId: 'export:req-1',
          removeOnComplete: true,
        },
      );

      expect(mockPrismaService.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: {
          status: 'PUBLISHED',
          publishedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      });

      expect(stats).toEqual({ published: 1, failed: 0, skipped: 0 });
    });

    it('should use outbox:id as fallback deterministic jobId when options.jobId is not provided', async () => {
      const now = new Date();
      const mockEvent = {
        id: 'outbox-2',
        queueName: 'users-processing',
        eventName: 'user-cleanup',
        payload: { userId: 'u2' },
        options: null,
        status: 'PENDING',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      mockPrismaService.outboxEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaService.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.outboxEvent.update.mockResolvedValue({
        ...mockEvent,
        status: 'PUBLISHED',
      });

      const stats = await service.publishPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'user-cleanup',
        { userId: 'u2' },
        { jobId: 'outbox:outbox-2' },
      );
      expect(stats.published).toBe(1);
    });

    it('should skip event if atomic claim count is 0 (concurrent worker won the race)', async () => {
      const now = new Date();
      const mockEvent = {
        id: 'outbox-3',
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: {},
        options: null,
        status: 'PENDING',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      mockPrismaService.outboxEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaService.outboxEvent.updateMany.mockResolvedValue({ count: 0 });

      const stats = await service.publishPendingEvents();

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockPrismaService.outboxEvent.update).not.toHaveBeenCalled();
      expect(stats).toEqual({ published: 0, failed: 0, skipped: 1 });
    });

    it('should recover and publish stuck PROCESSING event whose lease has expired (crash recovery)', async () => {
      const expiredUpdatedAt = new Date(
        Date.now() - OUTBOX_LEASE_DURATION_MS - 10000,
      );
      const stuckEvent = {
        id: 'outbox-stuck',
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: { requestId: 'req-stuck' },
        options: null,
        status: 'PROCESSING',
        retryCount: 0,
        createdAt: expiredUpdatedAt,
        updatedAt: expiredUpdatedAt,
      };

      mockPrismaService.outboxEvent.findMany.mockResolvedValue([stuckEvent]);
      mockPrismaService.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.outboxEvent.update.mockResolvedValue({
        ...stuckEvent,
        status: 'PUBLISHED',
      });

      const stats = await service.publishPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'export-data',
        { requestId: 'req-stuck' },
        { jobId: 'outbox:outbox-stuck' },
      );
      expect(stats.published).toBe(1);
    });

    it('should handle queue dispatch failure, increment retryCount, and reset status to PENDING', async () => {
      const now = new Date();
      const mockEvent = {
        id: 'outbox-fail',
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: {},
        options: null,
        status: 'PENDING',
        retryCount: 1,
        createdAt: now,
        updatedAt: now,
      };

      mockPrismaService.outboxEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaService.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
      mockQueue.add.mockRejectedValueOnce(new Error('Redis connection lost'));

      const stats = await service.publishPendingEvents();

      expect(mockPrismaService.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-fail' },
        data: {
          status: 'PENDING',
          retryCount: 2,
          lastError: 'Redis connection lost',
          updatedAt: expect.any(Date),
        },
      });
      expect(stats).toEqual({ published: 0, failed: 1, skipped: 0 });
    });

    it('should transition to FAILED when max retries reached', async () => {
      const now = new Date();
      const mockEvent = {
        id: 'outbox-max-fail',
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: {},
        options: null,
        status: 'PENDING',
        retryCount: OUTBOX_MAX_RETRIES - 1,
        createdAt: now,
        updatedAt: now,
      };

      mockPrismaService.outboxEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaService.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
      mockQueue.add.mockRejectedValueOnce(new Error('Persistent queue error'));

      const stats = await service.publishPendingEvents();

      expect(mockPrismaService.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-max-fail' },
        data: {
          status: 'FAILED',
          retryCount: OUTBOX_MAX_RETRIES,
          lastError: 'Persistent queue error',
          updatedAt: expect.any(Date),
        },
      });
      expect(stats).toEqual({ published: 0, failed: 1, skipped: 0 });
    });

    it('should mark failed if queue cannot be resolved', async () => {
      const now = new Date();
      const mockEvent = {
        id: 'outbox-missing-queue',
        queueName: 'unknown-queue',
        eventName: 'some-event',
        payload: {},
        options: null,
        status: 'PENDING',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      mockPrismaService.outboxEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaService.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

      const stats = await service.publishPendingEvents();

      expect(mockPrismaService.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-missing-queue' },
        data: {
          status: 'PENDING',
          retryCount: 1,
          lastError: expect.stringContaining(
            'BullMQ Queue "unknown-queue" is not registered',
          ),
          updatedAt: expect.any(Date),
        },
      });
      expect(stats).toEqual({ published: 0, failed: 1, skipped: 0 });
    });

    it('should return 0s if sweep is already in progress', async () => {
      (service as any).isSweeping = true;
      const stats = await service.publishPendingEvents();
      expect(stats).toEqual({ published: 0, failed: 0, skipped: 0 });
      (service as any).isSweeping = false;
    });

    it('should return 0s when outbox delegate is not available', async () => {
      const originalDelegate = (mockPrismaService as any).outboxEvent;
      delete (mockPrismaService as any).outboxEvent;

      const stats = await service.publishPendingEvents();
      expect(stats).toEqual({ published: 0, failed: 0, skipped: 0 });

      (mockPrismaService as any).outboxEvent = originalDelegate;
    });

    it('should catch and log error if delegate.findMany throws non-Error string', async () => {
      mockPrismaService.outboxEvent.findMany.mockRejectedValueOnce(
        'Database disconnect string',
      );

      const stats = await service.publishPendingEvents();
      expect(stats).toEqual({ published: 0, failed: 0, skipped: 0 });
    });

    it('should catch and log error if delegate.findMany throws Error instance', async () => {
      mockPrismaService.outboxEvent.findMany.mockRejectedValueOnce(
        new Error('Database disconnect Error object'),
      );

      const stats = await service.publishPendingEvents();
      expect(stats).toEqual({ published: 0, failed: 0, skipped: 0 });
    });

    it('should handle queue dispatch failure when error is a non-Error string', async () => {
      const now = new Date();
      const mockEvent = {
        id: 'outbox-fail-str',
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: {},
        options: null,
        status: 'PENDING',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      mockPrismaService.outboxEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaService.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
      mockQueue.add.mockRejectedValueOnce('Raw string error');

      const stats = await service.publishPendingEvents();
      expect(stats).toEqual({ published: 0, failed: 1, skipped: 0 });
    });
  });

  describe('triggerImmediatePublish and handleCronSweep', () => {
    it('triggerImmediatePublish should trigger async flush', async () => {
      const spy = vi.spyOn(service, 'publishPendingEvents').mockResolvedValue({
        published: 0,
        failed: 0,
        skipped: 0,
      });

      service.triggerImmediatePublish();

      await new Promise((resolve) => setImmediate(resolve));
      expect(spy).toHaveBeenCalled();
    });

    it('triggerImmediatePublish should catch errors and log warning', async () => {
      vi.spyOn(service, 'publishPendingEvents').mockRejectedValueOnce(
        new Error('Async sweep failed'),
      );

      service.triggerImmediatePublish();

      await new Promise((resolve) => setImmediate(resolve));
    });

    it('triggerImmediatePublish should catch non-Error strings and log warning', async () => {
      vi.spyOn(service, 'publishPendingEvents').mockRejectedValueOnce(
        'Async sweep string error',
      );

      service.triggerImmediatePublish();

      await new Promise((resolve) => setImmediate(resolve));
    });

    it('handleCronSweep should call publishPendingEvents', async () => {
      const spy = vi.spyOn(service, 'publishPendingEvents').mockResolvedValue({
        published: 1,
        failed: 0,
        skipped: 0,
      });

      await service.handleCronSweep();
      expect(spy).toHaveBeenCalled();
    });
  });
});
