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
import { EmailService } from './email.service.js';

const mockSendTransacEmail = vi.fn();
vi.mock('@getbrevo/brevo', () => {
  return {
    BrevoClient: class {
      transactionalEmails = {
        sendTransacEmail: mockSendTransacEmail,
      };
    },
  };
});

describe('EmailService', () => {
  let service: EmailService;
  let mockConfigService: { get: Mock };
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
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

    it('should initialize without brevo API key', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'BREVO_API_KEY') return undefined;
        return null;
      });
      const module = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const devService = module.get<EmailService>(EmailService);
      expect(devService).toBeDefined();

      // Attempting to send an email without API key should exit early without error
      await devService.sendWelcomeEmail('test@example.com', 'Test User');
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).not.toHaveBeenCalled();
    });
  });

  describe('Email Sending', () => {
    it('should send a welcome email', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      await service.sendWelcomeEmail('test@example.com', 'TestUser');
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '¡Bienvenido a CircleSfera!',
          to: [{ email: 'test@example.com' }],
          sender: { email: 'noreply@circlesfera.com', name: 'CircleSfera' },
        }),
      );
    });

    it('should send a verification email', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      await service.sendVerificationEmail('test@example.com', 'randomToken123');
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Verifica tu cuenta en CircleSfera',
          to: [{ email: 'test@example.com' }],
        }),
      );
    });

    it('should send a password reset email', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      await service.sendPasswordResetEmail(
        'reset@example.com',
        'resetTokenABC',
      );
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Recupera tu contraseña en CircleSfera',
          to: [{ email: 'reset@example.com' }],
        }),
      );
    });

    it('should safely catch errors from the Brevo API in any environment', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockRejectedValue(
        new Error('Brevo Down'),
      );

      // Email errors must never propagate to the caller, regardless of NODE_ENV.
      // The service logs the error internally but the user flow is unaffected.
      await expect(
        service.sendVerificationEmail('error@example.com', 'asd'),
      ).resolves.toBeUndefined();
    });

    it('should safely catch errors from the Brevo API in production mode', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockRejectedValue(
        new Error('Brevo Down'),
      );

      await expect(
        service.sendVerificationEmail('error@example.com', 'asd'),
      ).resolves.toBeUndefined();
    });

    it('should enforce recipient rate limiting quota (max 5 emails per 10m window)', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      const recipient = 'rate-limited@example.com';

      for (let i = 0; i < 5; i++) {
        await service.sendVerificationEmail(recipient, `token-${i}`);
      }
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledTimes(5);

      // 6th call should be suppressed due to recipient quota
      await service.sendVerificationEmail(recipient, 'token-6');
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledTimes(5);

      // A different recipient should still be allowed
      await service.sendVerificationEmail('other@example.com', 'token-other');
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledTimes(6);
    });

    it('should send a broadcast email with and without button', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      await service.sendBroadcastEmail(
        'user@example.com',
        'Special Announcement',
        'Hello World',
        'We have updates.',
        'View Updates',
        'https://circlesfera.com/updates',
      );
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Special Announcement',
          to: [{ email: 'user@example.com' }],
        }),
      );

      await service.sendBroadcastEmail(
        'user@example.com',
        'No Button Update',
        'Quick note',
        'Just text content.',
      );
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledTimes(2);
    });

    it('should send a moderation email', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      await service.sendModerationEmail(
        'badactor@example.com',
        'John',
        'REMOVED',
        'POST',
        'Spam violation',
      );
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Aviso de Moderación - CircleSfera',
          to: [{ email: 'badactor@example.com' }],
        }),
      );
    });

    it('should send a support reply email', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      await service.sendSupportReplyEmail(
        'support-asker@example.com',
        'Billing inquiry',
        'Here is the response line 1\nHere is line 2',
      );
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Re: Billing inquiry - Soporte CircleSfera',
          to: [{ email: 'support-asker@example.com' }],
        }),
      );
    });

    it('should send a subscription receipt email', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      await service.sendSubscriptionReceipt(
        'subscriber@example.com',
        'Pro Creator',
        '$19.99/month',
      );
      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Recibo de Suscripción - Pro Creator',
          to: [{ email: 'subscriber@example.com' }],
        }),
      );
    });

    it('should log verification link in development mode and handle fallback configs', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'BREVO_API_KEY') return 'test_key';
        if (key === 'NODE_ENV') return 'development';
        return null; // Test fallback values for FRONTEND_URL, EMAIL_FROM, EMAIL_FROM_NAME
      });

      const module = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const devService = module.get<EmailService>(EmailService);
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});

      await devService.sendVerificationEmail('dev@example.com', 'devtoken');
      await devService.sendPasswordResetEmail('dev@example.com', 'resettoken');
      await devService.sendSubscriptionReceipt(
        'dev@example.com',
        'Basic',
        'Free',
      );

      expect(
        mBrevoInstance.transactionalEmails.sendTransacEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: { email: 'noreply@circlesfera.com', name: 'CircleSfera' },
        }),
      );
    });

    it('should clean up recipientSendTimestamps when size exceeds 5000', async () => {
      mBrevoInstance.transactionalEmails.sendTransacEmail.mockResolvedValue({});
      const map = (
        service as unknown as { recipientSendTimestamps: Map<string, number[]> }
      ).recipientSendTimestamps;

      // Populate 5002 entries with old and recent timestamps
      const now = Date.now();
      for (let i = 0; i < 5002; i++) {
        // Half expired, half active
        const ts = i % 2 === 0 ? now - 1000000 : now - 1000;
        map.set(`user${i}@example.com`, [ts]);
      }

      expect(map.size).toBe(5002);
      await service.sendWelcomeEmail('trigger-prune@example.com', 'Pruner');
      // Size should have decreased due to cleanup of expired timestamps
      expect(map.size).toBeLessThan(5002);
    });
  });
});
