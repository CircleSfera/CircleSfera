import { Test, type TestingModule } from '@nestjs/testing';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionProcessor } from './account-deletion.processor.js';
import { DataExportProcessor } from './data-export.processor.js';
import { UsersProcessor } from './users.processor.js';

describe('UsersProcessor', () => {
  let processor: UsersProcessor;
  let accountDeletionProcessor: { process: ReturnType<typeof vi.fn> };
  let dataExportProcessor: { process: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    accountDeletionProcessor = {
      process: vi.fn().mockResolvedValue({ status: 'account-handled' }),
    };
    dataExportProcessor = {
      process: vi.fn().mockResolvedValue({ status: 'export-handled' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersProcessor,
        {
          provide: AccountDeletionProcessor,
          useValue: accountDeletionProcessor,
        },
        {
          provide: DataExportProcessor,
          useValue: dataExportProcessor,
        },
      ],
    }).compile();

    processor = module.get<UsersProcessor>(UsersProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('rejects the retired clean-expired-search-history job name (DATA-005: consolidated into MaintenanceService)', async () => {
    const job = { id: 'job-1', name: 'clean-expired-search-history' } as any;
    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
    expect(accountDeletionProcessor.process).not.toHaveBeenCalled();
  });

  it('delegates clean-expired-accounts to AccountDeletionProcessor', async () => {
    const job = { id: 'job-2', name: 'clean-expired-accounts' } as any;
    const res = await processor.process(job);
    expect(accountDeletionProcessor.process).toHaveBeenCalledWith(job);
    expect(res).toEqual({ status: 'account-handled' });
  });

  it('delegates hard-delete-user to AccountDeletionProcessor', async () => {
    const job = { id: 'job-3', name: 'hard-delete-user' } as any;
    const res = await processor.process(job);
    expect(accountDeletionProcessor.process).toHaveBeenCalledWith(job);
    expect(res).toEqual({ status: 'account-handled' });
  });

  it('delegates export-data to DataExportProcessor', async () => {
    const job = { id: 'job-4', name: 'export-data' } as any;
    const res = await processor.process(job);
    expect(dataExportProcessor.process).toHaveBeenCalledWith(job);
    expect(res).toEqual({ status: 'export-handled' });
  });

  it('delegates clean-expired-data-exports to DataExportProcessor', async () => {
    const job = { id: 'job-5', name: 'clean-expired-data-exports' } as any;
    const res = await processor.process(job);
    expect(dataExportProcessor.process).toHaveBeenCalledWith(job);
    expect(res).toEqual({ status: 'export-handled' });
  });

  it('throws UnrecoverableError for unknown job names', async () => {
    const job = { id: 'job-6', name: 'unknown-job-name' } as any;
    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
    await expect(processor.process(job)).rejects.toThrow(
      'Unknown job name in users-processing queue: unknown-job-name',
    );
  });
});
