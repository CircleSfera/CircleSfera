import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { QUEUE_NAMES } from '../common/constants/queue-policy.constants.js';
import { EmailService, isTransientBrevoFailure } from './email.service.js';

const mockSendTransacEmail = vi.fn();

const { MockBrevoError } = vi.hoisted(() => {
  class MockBrevoError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return { MockBrevoError };
});

vi.mock('@getbrevo/brevo', () => {
  return {
    BrevoClient: class {
      transactionalEmails = {
        sendTransacEmail: mockSendTransacEmail,
      };
    },
    BrevoError: MockBrevoError,
  };
});

describe('EmailService', () => {
  let service: EmailService;
  let mockConfigService: { get: Mock };
  let mockEmailQueue: { add: Mock };
  let mBrevoInstance: {
    transactionalEmails: { sendTransacEmail: Mock };
  };

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn(),
    };

    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'BREVO_API_KEY') return 'test_brevo_key';
      if (key === 'FRONTEND_URL') return 'http://localhost:5173';
      if (key === 'EMAIL_FROM') return 'noreply@circlesfera.com';
      if (key === 'EMAIL_FROM_NAME') return 'CircleSfera';
      if (key === 'NODE_ENV') return 'production';
      return null;
    });

    mockEmailQueue = { add: vi.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getQueueToken(QUEUE_NAMES.EMAIL_PROCESSING),
          useValue: mockEmailQueue,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    // Since BrevoClient is instantiated inside, we mock its shape
    const { BrevoClient } = await import('@getbrevo/brevo');
    mBrevoInstance = new BrevoClient({ apiKey: 'dummy' }) as unknown as {
      transactionalEmails: { sendTransacEmail: Mock };
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize without brevo API key and skip enqueueing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'BREVO_API_KEY') return undefined;
        return null;
      });
      const module = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
          {
            provide: getQueueToken(QUEUE_NAMES.EMAIL_PROCESSING),
            useValue: mockEmailQueue,
          },
        ],
      }).compile();
      const devService = module.get<EmailService>(EmailService);
      expect(devService).toBeDefined();

      // Attempting to send an email without API key should exit early without error
      await devService.sendWelcomeEmail('test@example.com', 'Test User');
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('isTransientBrevoFailure', () => {
    it('treats a non-BrevoError as transient', () => {
      expect(isTransientBrevoFailure(new Error('network blip'))).toBe(true);
      expect(isTransientBrevoFailure('some string')).toBe(true);
    });

    it('treats a BrevoError with no statusCode as transient', () => {
      expect(isTransientBrevoFailure(new MockBrevoError('timeout'))).toBe(true);
    });

    it('treats 429 as transient', () => {
      expect(
        isTransientBrevoFailure(new MockBrevoError('rate limited', 429)),
      ).toBe(true);
    });

    it('treats 5xx as transient', () => {
      expect(
        isTransientBrevoFailure(new MockBrevoError('server error', 503)),
      ).toBe(true);
    });

    it('treats other 4xx as permanent', () => {
      expect(
        isTransientBrevoFailure(new MockBrevoError('bad request', 400)),
      ).toBe(false);
      expect(
        isTransientBrevoFailure(new MockBrevoError('unauthorized', 401)),
      ).toBe(false);
    });
  });

  describe('Email Sending (enqueues, never calls Brevo directly)', () => {
    it('should enqueue a welcome email', async () => {
      await service.sendWelcomeEmail('test@example.com', 'TestUser');
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-transactional-email',
        expect.objectContaining({
          to: 'test@example.com',
          subject: '¡Bienvenido a CircleSfera!',
        }),
      );
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).not.toHaveBeenCalled();
    });

    it('should enqueue a verification email', async () => {
      await service.sendVerificationEmail('test@example.com', 'randomToken123');
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-transactional-email',
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Verifica tu cuenta en CircleSfera',
        }),
      );
    });

    it('should enqueue a password reset email', async () => {
      await service.sendPasswordResetEmail(
        'reset@example.com',
        'resetTokenABC',
      );
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-transactional-email',
        expect.objectContaining({
          to: 'reset@example.com',
          subject: 'Recupera tu contraseña en CircleSfera',
        }),
      );
    });

    it('should enqueue a broadcast email with and without button', async () => {
      await service.sendBroadcastEmail(
        'user@example.com',
        'Special Announcement',
        'Hello World',
        'We have updates.',
        'View Updates',
        'https://circlesfera.com/updates',
      );
      await service.sendBroadcastEmail(
        'user@example.com',
        'No Button Update',
        'Quick note',
        'Just text content.',
      );
      expect(mockEmailQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should enqueue a moderation email', async () => {
      await service.sendModerationEmail(
        'badactor@example.com',
        'John',
        'REMOVED',
        'POST',
        'Spam violation',
      );
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-transactional-email',
        expect.objectContaining({
          to: 'badactor@example.com',
          subject: 'Aviso de Moderación - CircleSfera',
        }),
      );
    });

    it('should enqueue a support reply email', async () => {
      await service.sendSupportReplyEmail(
        'support-asker@example.com',
        'Billing inquiry',
        'Here is the response line 1\nHere is line 2',
      );
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-transactional-email',
        expect.objectContaining({
          to: 'support-asker@example.com',
          subject: 'Re: Billing inquiry - Soporte CircleSfera',
        }),
      );
    });

    it('should enqueue a subscription receipt email', async () => {
      await service.sendSubscriptionReceipt(
        'subscriber@example.com',
        'Pro Creator',
        '$19.99/month',
      );
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-transactional-email',
        expect.objectContaining({
          to: 'subscriber@example.com',
          subject: 'Recibo de Suscripción - Pro Creator',
        }),
      );
    });

    it('should log verification link in development mode', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'BREVO_API_KEY') return 'test_key';
        if (key === 'NODE_ENV') return 'development';
        return null;
      });

      const module = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
          {
            provide: getQueueToken(QUEUE_NAMES.EMAIL_PROCESSING),
            useValue: mockEmailQueue,
          },
        ],
      }).compile();

      const devService = module.get<EmailService>(EmailService);
      await devService.sendVerificationEmail('dev@example.com', 'devtoken');
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-transactional-email',
        expect.objectContaining({ to: 'dev@example.com' }),
      );
    });
  });

  describe('deliverMail (the actual Brevo call, invoked by EmailProcessor)', () => {
    it('should call Brevo with the expected payload', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      await service.deliverMail({
        to: 'test@example.com',
        subject: 'Subject',
        html: '<p>hi</p>',
      });
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Subject',
          to: [{ email: 'test@example.com' }],
          sender: { email: 'noreply@circlesfera.com', name: 'CircleSfera' },
        }),
      );
    });

    it('should throw (not swallow) a Brevo failure so BullMQ retries it', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockRejectedValue(
        new Error('Brevo Down'),
      );

      await expect(
        service.deliverMail({
          to: 'error@example.com',
          subject: 'x',
          html: 'y',
        }),
      ).rejects.toThrow('Brevo Down');
    });

    it('should exit early without error when BREVO_API_KEY is unset', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'BREVO_API_KEY') return undefined;
        return null;
      });
      const module = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
          {
            provide: getQueueToken(QUEUE_NAMES.EMAIL_PROCESSING),
            useValue: mockEmailQueue,
          },
        ],
      }).compile();
      const devService = module.get<EmailService>(EmailService);

      await expect(
        devService.deliverMail({
          to: 'x@example.com',
          subject: 's',
          html: 'h',
        }),
      ).resolves.toBeUndefined();
    });

    it('should enforce recipient rate limiting quota (max 5 emails per 10m window) without throwing', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      const recipient = 'rate-limited@example.com';

      for (let i = 0; i < 5; i++) {
        await service.deliverMail({
          to: recipient,
          subject: `token-${i}`,
          html: 'h',
        });
      }
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledTimes(5);

      // 6th call should be suppressed due to recipient quota -- and must not throw,
      // since a suppression is not a failure worth retrying.
      await expect(
        service.deliverMail({ to: recipient, subject: 'token-6', html: 'h' }),
      ).resolves.toBeUndefined();
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledTimes(5);

      // A different recipient should still be allowed
      await service.deliverMail({
        to: 'other@example.com',
        subject: 'token-other',
        html: 'h',
      });
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledTimes(6);
    });

    it('should clean up recipientSendTimestamps when size exceeds 5000', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      const map = (
        service as unknown as { recipientSendTimestamps: Map<string, number[]> }
      ).recipientSendTimestamps;

      const now = Date.now();
      for (let i = 0; i < 5002; i++) {
        const ts = i % 2 === 0 ? now - 1000000 : now - 1000;
        map.set(`user${i}@example.com`, [ts]);
      }

      expect(map.size).toBe(5002);
      await service.deliverMail({
        to: 'trigger-prune@example.com',
        subject: 'Pruner',
        html: 'h',
      });
      expect(map.size).toBeLessThan(5002);
    });
  });
});
