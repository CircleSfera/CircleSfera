import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EXPORTS_DIR, LEGACY_EXPORTS_DIR } from './data-export.constants.js';
import { DataExportService } from './data-export.service.js';

describe('DataExportService', () => {
  let service: DataExportService;

  const mockPrismaService = {
    $transaction: vi
      .fn()
      .mockImplementation((cb: any) => cb(mockPrismaService)),
    dataExportRequest: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  const mockUsersQueue = {
    add: vi.fn().mockResolvedValue(true),
  };

  const mockOutboxService = {
    enqueue: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
    triggerImmediatePublish: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret-jwt-key-for-export';
      return null;
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );
    mockPrismaService.dataExportRequest.findFirst.mockResolvedValue(null);
    mockPrismaService.dataExportRequest.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OutboxService, useValue: mockOutboxService },
        {
          provide: getQueueToken('users-processing'),
          useValue: mockUsersQueue,
        },
      ],
    }).compile();

    service = module.get<DataExportService>(DataExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestDataExport', () => {
    it('should create data export request and enqueue durable outbox event inside transaction', async () => {
      mockPrismaService.dataExportRequest.create.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'PENDING',
      });

      const result = await service.requestDataExport('user-1');

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.dataExportRequest.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          status: 'PENDING',
        },
      });
      expect(mockOutboxService.enqueue).toHaveBeenCalledWith(
        mockPrismaService,
        {
          queueName: 'users-processing',
          eventName: 'export-data',
          payload: {
            requestId: 'export-1',
            userId: 'user-1',
          },
          options: {
            jobId: 'export:export-1',
            removeOnComplete: true,
            removeOnFail: false,
          },
        },
      );
      expect(mockOutboxService.triggerImmediatePublish).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Data export request has been queued.',
        requestId: 'export-1',
      });
    });

    it('should reject with ConflictException if user already has an active export', async () => {
      mockPrismaService.dataExportRequest.findFirst.mockResolvedValue({
        id: 'export-pending',
        status: 'PENDING',
      });

      await expect(service.requestDataExport('user-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockOutboxService.enqueue).not.toHaveBeenCalled();
    });

    it('should reject with 429 when daily quota (3 per 24h) is reached', async () => {
      mockPrismaService.dataExportRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.dataExportRequest.count.mockResolvedValue(3);

      const promise = service.requestDataExport('user-1');
      await expect(promise).rejects.toThrow(HttpException);

      try {
        await promise;
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }

      expect(mockOutboxService.enqueue).not.toHaveBeenCalled();
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

  describe('generateDownloadToken & verifyDownloadToken', () => {
    it('generates a signed token and verifies it successfully', () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000);
      const token = service.generateDownloadToken(
        'user-1',
        'export-1',
        expiresAt,
      );

      expect(typeof token).toBe('string');
      expect(token).toContain('.');

      const verified = service.verifyDownloadToken(token);
      expect(verified).toEqual({
        userId: 'user-1',
        requestId: 'export-1',
      });
    });

    it('returns null for an expired token', () => {
      const expiredAt = new Date(Date.now() - 1000);
      const token = service.generateDownloadToken(
        'user-1',
        'export-1',
        expiredAt,
      );

      const verified = service.verifyDownloadToken(token);
      expect(verified).toBeNull();
    });

    it('returns null for a tampered token signature', () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000);
      const token = service.generateDownloadToken(
        'user-1',
        'export-1',
        expiresAt,
      );
      const tampered = `${token.slice(0, -4)}abcd`;

      const verified = service.verifyDownloadToken(tampered);
      expect(verified).toBeNull();
    });

    it('returns null for an invalid token format', () => {
      expect(service.verifyDownloadToken('invalid-format')).toBeNull();
      expect(service.verifyDownloadToken('')).toBeNull();
    });
  });

  describe('streamDataExport', () => {
    const testFilePath = path.join(EXPORTS_DIR, 'export_export-1.zip');
    const legacyTestFilePath = path.join(
      EXPORTS_DIR,
      'export_user-1_export-1.zip',
    );

    afterEach(() => {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
      if (fs.existsSync(legacyTestFilePath)) {
        fs.unlinkSync(legacyTestFilePath);
      }
    });

    const createMockRes = () => {
      const res: any = new PassThrough();
      res.setHeader = vi.fn();
      res.status = vi.fn().mockReturnThis();
      res.json = vi.fn().mockReturnThis();
      res.headersSent = false;
      return res;
    };

    it('throws NotFoundException when request does not exist', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue(null);
      const res = createMockRes();

      await expect(
        service.streamDataExport('missing-id', 'user-1', undefined, res),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when request is still pending or processing', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'PROCESSING',
      });
      const res = createMockRes();

      await expect(
        service.streamDataExport('export-1', 'user-1', undefined, res),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 410 Gone when export has expired', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() - 1000), // Expired
      });
      const res = createMockRes();

      const promise = service.streamDataExport(
        'export-1',
        'user-1',
        undefined,
        res,
      );
      await expect(promise).rejects.toThrow(HttpException);
      try {
        await promise;
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.GONE);
      }
    });

    it('throws UnauthorizedException when no session and no token are provided', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      const res = createMockRes();

      await expect(
        service.streamDataExport('export-1', undefined, undefined, res),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when logged-in user requests another user export (cross-user)', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      const res = createMockRes();

      await expect(
        service.streamDataExport('export-1', 'attacker-user', undefined, res),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when request status is FAILED', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-failed',
        userId: 'user-1',
        status: 'FAILED',
      });
      const res = createMockRes();

      await expect(
        service.streamDataExport('export-failed', 'user-1', undefined, res),
      ).rejects.toThrow('Data export is not available or has failed.');
    });

    it('throws ForbiddenException when download token verification fails', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      const res = createMockRes();

      await expect(
        service.streamDataExport(
          'export-1',
          undefined,
          'invalid.token.str',
          res,
        ),
      ).rejects.toThrow('Invalid or expired download token.');
    });

    it('throws ForbiddenException when token belongs to different export or user', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      const res = createMockRes();
      const invalidToken = service.generateDownloadToken(
        'user-2',
        'export-2',
        new Date(Date.now() + 3600 * 1000),
      );

      await expect(
        service.streamDataExport('export-1', undefined, invalidToken, res),
      ).rejects.toThrow(ForbiddenException);
    });

    it('finds file at opaquePath if custom URL filename does not exist', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        url: 'http://localhost:3000/api/v1/users/gdpr/exports/custom_name.zip',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
      fs.writeFileSync(testFilePath, 'mock zip data content');

      const res = createMockRes();
      await service.streamDataExport('export-1', 'user-1', undefined, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/zip',
      );
    });

    it('throws NotFoundException when file does not exist on disk', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        url: 'http://localhost:3000/api/v1/users/gdpr/exports/export-1/download',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
      const res = createMockRes();

      await expect(
        service.streamDataExport('export-1', 'user-1', undefined, res),
      ).rejects.toThrow(NotFoundException);
    });

    it('streams export file successfully for authenticated owner', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        url: 'http://localhost:3000/api/v1/users/gdpr/exports/export-1/download',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
      fs.writeFileSync(testFilePath, 'mock zip data content');

      const res = createMockRes();

      await service.streamDataExport('export-1', 'user-1', undefined, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/zip',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('export_export-1.zip'),
      );
      // Verify no user identifiers in Content-Disposition
      const dispositionCall = res.setHeader.mock.calls.find(
        (call: any[]) => call[0] === 'Content-Disposition',
      );
      expect(dispositionCall[1]).not.toContain('user-1');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 21);
    });

    it('falls back to legacy filename with userId if only legacy exists on disk', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        url: 'http://localhost:3000/api/v1/users/gdpr/exports/export-1/download',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
      fs.writeFileSync(legacyTestFilePath, 'legacy mock zip data');

      const res = createMockRes();

      await service.streamDataExport('export-1', 'user-1', undefined, res);

      // Still delivers an opaque filename in Content-Disposition
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="export_export-1.zip"',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 20);
    });

    it('streams export file successfully for valid signed token', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        url: 'http://localhost:3000/api/v1/users/gdpr/exports/export-1/download',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
      fs.writeFileSync(testFilePath, 'mock zip data content');

      const res = createMockRes();
      const validToken = service.generateDownloadToken(
        'user-1',
        'export-1',
        new Date(Date.now() + 3600 * 1000),
      );

      await service.streamDataExport('export-1', undefined, validToken, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/zip',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="export_export-1.zip"',
      );
    });

    it('falls back to LEGACY_EXPORTS_DIR when legacy file exists there', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-legacy-dir',
        userId: 'user-1',
        status: 'COMPLETED',
        url: 'http://localhost:3000/api/v1/users/gdpr/exports/export-legacy-dir.zip',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      const legacyDirPath = path.join(
        LEGACY_EXPORTS_DIR,
        'export-legacy-dir.zip',
      );
      fs.mkdirSync(LEGACY_EXPORTS_DIR, { recursive: true });
      fs.writeFileSync(legacyDirPath, 'legacy dir zip content');

      const res = createMockRes();
      await service.streamDataExport(
        'export-legacy-dir',
        'user-1',
        undefined,
        res,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/zip',
      );
      if (fs.existsSync(legacyDirPath)) fs.unlinkSync(legacyDirPath);
    });

    it('handles stream error and returns 500 when headers not sent', async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-1',
        status: 'COMPLETED',
        url: 'http://localhost:3000/api/v1/users/gdpr/exports/export-1/download',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
      fs.writeFileSync(testFilePath, 'mock zip data');
      fs.chmodSync(testFilePath, 0o000);

      const res = createMockRes();

      try {
        await expect(
          service.streamDataExport('export-1', 'user-1', undefined, res),
        ).rejects.toThrow();

        expect(res.status).toHaveBeenCalledWith(500);
      } finally {
        fs.chmodSync(testFilePath, 0o644);
      }
    });
  });
});
