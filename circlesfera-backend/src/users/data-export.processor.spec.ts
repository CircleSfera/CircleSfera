import { PassThrough } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Job, UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DataExportProcessor } from './data-export.processor.js';
import { DataExportService } from './data-export.service.js';
import { UsersService } from './users.service.js';

let mockExistsSync = vi.fn().mockReturnValue(true);
let mockUnlinkSync = vi.fn();
let mockReaddirSync = vi
  .fn()
  .mockReturnValue(['old_archive.zip', 'not_zip.txt']);
let mockStatSync = vi
  .fn()
  .mockReturnValue({ mtimeMs: Date.now() - 10 * 24 * 60 * 60 * 1000 });
let mockCreateWriteStream = vi.fn().mockImplementation(() => {
  const stream = new PassThrough();
  // Ensure close event fires on stream end
  stream.on('finish', () => stream.emit('close'));
  return stream;
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (path: any) => mockExistsSync(path),
      unlinkSync: (path: any) => mockUnlinkSync(path),
      mkdirSync: vi.fn(),
      readdirSync: (path: any) => mockReaddirSync(path),
      statSync: (path: any) => mockStatSync(path),
      createWriteStream: (path: any) => mockCreateWriteStream(path),
    },
    existsSync: (path: any) => mockExistsSync(path),
    unlinkSync: (path: any) => mockUnlinkSync(path),
    mkdirSync: vi.fn(),
    readdirSync: (path: any) => mockReaddirSync(path),
    statSync: (path: any) => mockStatSync(path),
    createWriteStream: (path: any) => mockCreateWriteStream(path),
  };
});

describe('DataExportProcessor', () => {
  let processor: DataExportProcessor;
  let prisma: any;
  let configService: any;
  let usersService: any;
  let emailService: any;
  let dataExportService: any;

  beforeEach(async () => {
    mockExistsSync = vi.fn().mockReturnValue(true);
    mockUnlinkSync = vi.fn();
    mockReaddirSync = vi
      .fn()
      .mockReturnValue(['old_archive.zip', 'not_zip.txt']);
    mockStatSync = vi
      .fn()
      .mockReturnValue({ mtimeMs: Date.now() - 10 * 24 * 60 * 60 * 1000 });
    mockCreateWriteStream = vi.fn().mockImplementation(() => {
      const stream = new PassThrough();
      stream.on('finish', () => stream.emit('close'));
      return stream;
    });

    prisma = {
      dataExportRequest: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'user@test.com',
          profiles: [{ fullName: 'Test User', username: 'testuser' }],
        }),
      },
    };

    configService = {
      get: vi.fn().mockReturnValue('http://localhost:3000'),
    };

    usersService = {
      exportUserData: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
    };

    emailService = {
      sendBroadcastEmail: vi.fn().mockResolvedValue(true),
    };

    dataExportService = {
      generateDownloadToken: vi.fn().mockReturnValue('mock-token-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: UsersService, useValue: usersService },
        { provide: EmailService, useValue: emailService },
        { provide: DataExportService, useValue: dataExportService },
      ],
    }).compile();

    processor = module.get<DataExportProcessor>(DataExportProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process() router', () => {
    it('dispatches export-data job', async () => {
      const spy = vi
        .spyOn(processor, 'processDataExport')
        .mockResolvedValue(undefined as any);
      const job = {
        name: 'export-data',
        data: { requestId: 'req_1', userId: 'u_1' },
      } as Job;
      await processor.process(job);
      expect(spy).toHaveBeenCalledWith('req_1', 'u_1', job);
    });

    it('dispatches clean-expired-data-exports job', async () => {
      const spy = vi
        .spyOn(processor, 'cleanExpiredDataExports')
        .mockResolvedValue({ count: 1, deletedFiles: 1 });
      const job = { name: 'clean-expired-data-exports', data: {} } as Job;
      await processor.process(job);
      expect(spy).toHaveBeenCalled();
    });

    it('throws UnrecoverableError for unknown job', async () => {
      const job = { name: 'unknown-export-job', data: {} } as Job;
      await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
    });
  });

  describe('cleanExpiredDataExports', () => {
    it('purges expired export requests and unlinks files', async () => {
      prisma.dataExportRequest.findMany.mockResolvedValue([
        {
          id: 'req_1',
          userId: 'u_1',
          url: 'http://localhost/exports/legacy_req1.zip?param=1',
        },
      ]);

      const res = await processor.cleanExpiredDataExports();

      expect(prisma.dataExportRequest.findMany).toHaveBeenCalled();
      expect(mockUnlinkSync).toHaveBeenCalled();
      expect(prisma.dataExportRequest.deleteMany).toHaveBeenCalled();
      expect(res.count).toBe(2);
      expect(res.deletedFiles).toBeGreaterThan(0);
    });

    it('gracefully handles unlink or stat errors during orphan cleanup', async () => {
      mockStatSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const res = await processor.cleanExpiredDataExports();
      expect(res.count).toBe(2);
    });

    it('skips non-existent directories gracefully', async () => {
      mockExistsSync.mockReturnValue(false);
      const res = await processor.cleanExpiredDataExports();
      expect(res.deletedFiles).toBe(0);
    });

    it('re-throws if database query fails', async () => {
      prisma.dataExportRequest.findMany.mockRejectedValue(
        new Error('DB unreachable'),
      );
      await expect(processor.cleanExpiredDataExports()).rejects.toThrow(
        'DB unreachable',
      );
    });
  });

  describe('processDataExport', () => {
    it('throws UnrecoverableError when requestId or userId is missing', async () => {
      await expect(processor.processDataExport('', 'u1')).rejects.toThrow(
        'Missing requestId or userId for data export',
      );
      await expect(processor.processDataExport('req1', '')).rejects.toThrow(
        'Missing requestId or userId for data export',
      );
    });

    it('marks FAILED and throws when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        processor.processDataExport('req1', 'u_missing'),
      ).rejects.toThrow('User not found: u_missing');

      expect(prisma.dataExportRequest.update).toHaveBeenCalledWith({
        where: { id: 'req1' },
        data: { status: 'FAILED' },
      });
    });

    it('successfully creates zip, updates DB to COMPLETED, and sends broadcast email', async () => {
      await processor.processDataExport('req1', 'u1');

      expect(prisma.dataExportRequest.update).toHaveBeenCalledWith({
        where: { id: 'req1' },
        data: { status: 'PROCESSING' },
      });

      expect(usersService.exportUserData).toHaveBeenCalledWith('u1');
      expect(dataExportService.generateDownloadToken).toHaveBeenCalled();
      expect(emailService.sendBroadcastEmail).toHaveBeenCalledWith(
        'user@test.com',
        'Your Data Export is Ready',
        'Hello Test User',
        expect.any(String),
        'Download My Data',
        expect.stringContaining('mock-token-123'),
      );
      expect(prisma.dataExportRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req1' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('falls back to username or "User" when profile fullName is missing', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u2',
        email: 'u2@test.com',
        profiles: [{ fullName: null, username: 'justuser' }],
      });

      await processor.processDataExport('req2', 'u2');

      expect(emailService.sendBroadcastEmail).toHaveBeenCalledWith(
        'u2@test.com',
        'Your Data Export is Ready',
        'Hello justuser',
        expect.any(String),
        'Download My Data',
        expect.any(String),
      );
    });

    it('falls back to "User" when profiles array is empty', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u3',
        email: 'u3@test.com',
        profiles: [],
      });

      await processor.processDataExport('req3', 'u3');

      expect(emailService.sendBroadcastEmail).toHaveBeenCalledWith(
        'u3@test.com',
        'Your Data Export is Ready',
        'Hello User',
        expect.any(String),
        'Download My Data',
        expect.any(String),
      );
    });

    it('creates EXPORTS_DIR if it does not exist', async () => {
      mockExistsSync.mockReturnValueOnce(false); // for EXPORTS_DIR check
      await processor.processDataExport('req_mkdir', 'u1');
      expect(prisma.dataExportRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req_mkdir' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('marks FAILED on terminal error when max attempts reached', async () => {
      usersService.exportUserData.mockRejectedValue(
        new Error('Export data fail'),
      );
      const mockJob = { attemptsMade: 2, opts: { attempts: 3 } } as any;

      await expect(
        processor.processDataExport('req_term', 'u1', mockJob),
      ).rejects.toThrow('Export data fail');

      expect(prisma.dataExportRequest.update).toHaveBeenCalledWith({
        where: { id: 'req_term' },
        data: { status: 'FAILED' },
      });
    });

    it('handles error in output.on close callback and rejects', async () => {
      emailService.sendBroadcastEmail.mockRejectedValue(
        new Error('Email server timeout'),
      );
      await expect(
        processor.processDataExport('req_close_err', 'u1'),
      ).rejects.toThrow('Email server timeout');
    });

    it('rejects when archive emits an error', async () => {
      const { ZipArchive } = await import('archiver');
      const appendSpy = vi
        .spyOn(ZipArchive.prototype, 'append')
        .mockImplementation(function (this: any) {
          process.nextTick(() =>
            this.emit('error', new Error('Archive corrupt')),
          );
          return this;
        });

      await expect(
        processor.processDataExport('req_arch_err', 'u1'),
      ).rejects.toThrow('Archive corrupt');

      appendSpy.mockRestore();
    });
  });
});
