import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../email.service.js';
import { EmailProcessor } from './email.processor.js';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;

  const mockEmailService = {
    deliverMail: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('throws UnrecoverableError for an unknown job name', async () => {
    const job = {
      name: 'not-a-real-job',
      data: { to: 'x@example.com', subject: 's', html: 'h' },
    } as Job<any, void, string>;

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
    expect(mockEmailService.deliverMail).not.toHaveBeenCalled();
  });

  it('delivers the mail on a valid job', async () => {
    mockEmailService.deliverMail.mockResolvedValue(undefined);
    const job = {
      name: 'send-transactional-email',
      data: { to: 'x@example.com', subject: 's', html: 'h' },
    } as Job<any, void, string>;

    await processor.process(job);
    expect(mockEmailService.deliverMail).toHaveBeenCalledWith(job.data);
  });

  it('rethrows a transient failure so BullMQ retries it', async () => {
    mockEmailService.deliverMail.mockRejectedValue(new Error('network blip'));
    const job = {
      name: 'send-transactional-email',
      data: { to: 'x@example.com', subject: 's', html: 'h' },
    } as Job<any, void, string>;

    await expect(processor.process(job)).rejects.toThrow('network blip');
  });

  it('wraps a permanent Brevo failure in UnrecoverableError', async () => {
    const { BrevoError } = await import('@getbrevo/brevo');
    mockEmailService.deliverMail.mockRejectedValue(
      new BrevoError({ message: 'bad request', statusCode: 400 }),
    );
    const job = {
      name: 'send-transactional-email',
      data: { to: 'x@example.com', subject: 's', html: 'h' },
    } as Job<any, void, string>;

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });
});
