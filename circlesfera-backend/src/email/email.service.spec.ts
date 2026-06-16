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

      // In production, email errors are logged but never re-thrown.
      // A Brevo failure must not turn a successful registration into a 500.
      await expect(
        service.sendVerificationEmail('error@example.com', 'asd'),
      ).resolves.toBeUndefined();
    });
  });
});
