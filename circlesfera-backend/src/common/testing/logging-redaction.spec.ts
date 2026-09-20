import { HttpStatus } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';
import { SlackService } from '../../slack/slack.service.js';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter.js';
import {
  createPinoRedactPaths,
  isSensitiveKey,
  REDACTED_CENSOR,
  redactSensitiveData,
  redactSensitiveText,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from '../observability/redaction.util.js';

describe('Logging & Telemetry Sensitive Data Redaction (SEC-011)', () => {
  describe('isSensitiveKey', () => {
    it('correctly identifies canonical sensitive keys', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('currentPassword')).toBe(true);
      expect(isSensitiveKey('newPassword')).toBe(true);
      expect(isSensitiveKey('refreshToken')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('token')).toBe(true);
      expect(isSensitiveKey('secret')).toBe(true);
      expect(isSensitiveKey('clientSecret')).toBe(true);
      expect(isSensitiveKey('jwtSecret')).toBe(true);
      expect(isSensitiveKey('webhookSecret')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('cookie')).toBe(true);
      expect(isSensitiveKey('set-cookie')).toBe(true);
      expect(isSensitiveKey('x-csrf-token')).toBe(true);
      expect(isSensitiveKey('csrf_token')).toBe(true);
      expect(isSensitiveKey('totpSecret')).toBe(true);
      expect(isSensitiveKey('totpCode')).toBe(true);
      expect(isSensitiveKey('cvv')).toBe(true);
      expect(isSensitiveKey('cardNumber')).toBe(true);
      expect(isSensitiveKey('credit_card')).toBe(true);
      expect(isSensitiveKey('privateKey')).toBe(true);
    });

    it('identifies compound and kebab/snake-case variants', () => {
      expect(isSensitiveKey('user_password')).toBe(true);
      expect(isSensitiveKey('USER-PASSWORD')).toBe(true);
      expect(isSensitiveKey('auth_token')).toBe(true);
      expect(isSensitiveKey('stripe_signature')).toBe(true);
      expect(isSensitiveKey('stripeClientSecret')).toBe(true);
      expect(isSensitiveKey('resetToken')).toBe(true);
    });

    it('does not falsely classify regular business keys', () => {
      expect(isSensitiveKey('username')).toBe(false);
      expect(isSensitiveKey('email')).toBe(false);
      expect(isSensitiveKey('bio')).toBe(false);
      expect(isSensitiveKey('role')).toBe(false);
      expect(isSensitiveKey('id')).toBe(false);
      expect(isSensitiveKey('status')).toBe(false);
      expect(isSensitiveKey('promptTokens')).toBe(false);
      expect(isSensitiveKey('completionTokens')).toBe(false);
      expect(isSensitiveKey('tokenLimit')).toBe(false);
    });
  });

  describe('redactSensitiveText', () => {
    it('redacts JWT tokens', () => {
      const sampleJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const input = `Error: User authentication failed for token ${sampleJwt} at step 2`;
      const result = redactSensitiveText(input);

      expect(result).not.toContain(sampleJwt);
      expect(result).toContain('[REDACTED_JWT]');
      expect(result).toBe(
        'Error: User authentication failed for token [REDACTED_JWT] at step 2',
      );
    });

    it('redacts Stripe secret keys and webhook secrets', () => {
      const secretKey = 'sk_live_51OzTestKey123456789012345678';
      const restrictedKey = 'rk_test_51OzRestrictedKey1234567890';
      const webhookSecret = 'whsec_abcdef1234567890abcdef1234567890';
      const clientSecret =
        'pi_3MtwxAE2eZvKYlo21F25325_secret_Yr5a2testKeySecret123';

      const input = `Keys: ${secretKey}, ${restrictedKey}, ${webhookSecret}, ${clientSecret}`;
      const result = redactSensitiveText(input);

      expect(result).not.toContain(secretKey);
      expect(result).not.toContain(restrictedKey);
      expect(result).not.toContain(webhookSecret);
      expect(result).not.toContain(clientSecret);
      expect(result).toContain('[REDACTED_STRIPE_KEY]');
      expect(result).toContain('[REDACTED_STRIPE_WEBHOOK_SECRET]');
      expect(result).toContain('[REDACTED_STRIPE_CLIENT_SECRET]');
    });

    it('redacts Bearer and Basic authorization strings', () => {
      const bearer = 'Bearer ya29.a0AfH6SMBsomethingVerySecret12345';
      const basic = 'Basic dXNlcjpwYXNzd29yZA==';
      const input = `Headers received: ${bearer} and ${basic}`;
      const result = redactSensitiveText(input);

      expect(result).toContain('Bearer [REDACTED]');
      expect(result).toContain('Basic [REDACTED]');
      expect(result).not.toContain('ya29.a0AfH6SMBsomethingVerySecret12345');
      expect(result).not.toContain('dXNlcjpwYXNzd29yZA==');
    });

    it('redacts database and redis passwords from connection strings', () => {
      const postgres =
        'postgresql://circlesfera_admin:SuperSecretPass123!@db.internal.circlesfera.com:5432/circlesfera_prod';
      const redis = 'redis://default:TopSecretRedisPass99@redis.cache:6379/0';

      const input = `Connection failed to ${postgres} and ${redis}`;
      const result = redactSensitiveText(input);

      expect(result).not.toContain('SuperSecretPass123!');
      expect(result).not.toContain('TopSecretRedisPass99');
      expect(result).toContain(
        'postgresql://circlesfera_admin:[REDACTED]@db.internal.circlesfera.com:5432/circlesfera_prod',
      );
      expect(result).toContain('redis://default:[REDACTED]@redis.cache:6379/0');
    });

    it('redacts S3 signed parameters', () => {
      const s3Url =
        'https://bucket.s3.amazonaws.com/image.jpg?X-Amz-Credential=MOCK_S3_CREDENTIAL%2F20260920%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=abcdef0123456789abcdef';
      const result = redactSensitiveText(s3Url);

      expect(result).not.toContain('abcdef0123456789abcdef');
      expect(result).toContain('X-Amz-Signature=[REDACTED]');
      expect(result).toContain('X-Amz-Credential=[REDACTED]');
    });
  });

  describe('redactSensitiveData', () => {
    it('deeply sanitizes nested objects and arrays', () => {
      const payload = {
        user: {
          id: 'usr_123',
          email: 'user@example.com',
          password: 'plain_text_password',
          tokens: {
            accessToken: 'sample_access_token',
            refreshToken: 'sample_refresh_token',
          },
        },
        billing: {
          cardNumber: '4242424242424242',
          cvv: '123',
          exp_month: 12,
        },
        items: [
          { name: 'item1', clientSecret: 'pi_secret_123' },
          { name: 'item2', normalData: 'safe' },
        ],
      };

      const sanitized = redactSensitiveData(payload);

      expect(sanitized.user.id).toBe('usr_123');
      expect(sanitized.user.email).toBe('user@example.com');
      expect(sanitized.user.password).toBe(REDACTED_CENSOR);
      expect(sanitized.user.tokens.accessToken).toBe(REDACTED_CENSOR);
      expect(sanitized.user.tokens.refreshToken).toBe(REDACTED_CENSOR);
      expect(sanitized.billing.cardNumber).toBe(REDACTED_CENSOR);
      expect(sanitized.billing.cvv).toBe(REDACTED_CENSOR);
      expect(sanitized.billing.exp_month).toBe(REDACTED_CENSOR);
      expect(sanitized.items[0].clientSecret).toBe(REDACTED_CENSOR);
      expect(sanitized.items[1].normalData).toBe('safe');
    });

    it('sanitizes URL query parameters in url-like fields', () => {
      const payload = {
        redirectUrl:
          'https://circlesfera.com/callback?token=my_secret_token&state=123',
        avatarUri: 'https://cdn.circlesfera.com/avatar.png?sig=sensitive_sig',
      };

      const sanitized = redactSensitiveData(payload);

      expect(sanitized.redirectUrl).toContain('token=%5BREDACTED%5D');
      expect(sanitized.redirectUrl).not.toContain('my_secret_token');
      expect(sanitized.avatarUri).toContain('sig=%5BREDACTED%5D');
      expect(sanitized.avatarUri).not.toContain('sensitive_sig');
    });

    it('handles circular references gracefully without crashing', () => {
      const circularObj: any = { name: 'circularNode', secret: 'hideMe' };
      circularObj.self = circularObj;

      const sanitized = redactSensitiveData(circularObj);

      expect(sanitized.name).toBe('circularNode');
      expect(sanitized.secret).toBe(REDACTED_CENSOR);
      expect(sanitized.self).toBe('[CIRCULAR]');
    });

    it('safely handles null and primitives', () => {
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
      expect(redactSensitiveData(42)).toBe(42);
      expect(redactSensitiveData(true)).toBe(true);
    });
  });

  describe('createPinoRedactPaths', () => {
    it('includes essential header and body paths', () => {
      const paths = createPinoRedactPaths();

      expect(paths).toContain('req.headers.cookie');
      expect(paths).toContain('req.headers.authorization');
      expect(paths).toContain('req.headers["x-csrf-token"]');
      expect(paths).toContain('req.headers["set-cookie"]');
      expect(paths).toContain('res.headers["set-cookie"]');
      expect(paths).toContain('req.body.password');
      expect(paths).toContain('req.body.refreshToken');
      expect(paths).toContain('req.body.cvv');
      expect(paths).toContain('req.body.*.password');
      expect(paths).toContain('password');
      expect(paths).toContain('refreshToken');
      expect(paths).toContain('*.password');
    });
  });

  describe('Sentry Scrubbing (scrubSentryBreadcrumb & scrubSentryEvent)', () => {
    it('scrubs breadcrumb messages and data', () => {
      const breadcrumb = {
        category: 'auth',
        message:
          'User logged in with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        data: {
          password: 'plain_password',
          url: 'https://api.circlesfera.com/auth?token=super_secret',
        },
      };

      const scrubbed = scrubSentryBreadcrumb(breadcrumb);

      expect(scrubbed.message).toContain('[REDACTED_JWT]');
      expect(scrubbed.data.password).toBe(REDACTED_CENSOR);
      expect(scrubbed.data.url).toContain('token=%5BREDACTED%5D');
    });

    it('scrubs full Sentry event data, request, exception, and stack variables', () => {
      const event = {
        message: 'Failure in payment sk_live_51OzTestKey123456789012345678',
        request: {
          url: 'https://api.circlesfera.com/checkout?token=leakMe',
          headers: {
            authorization: 'Bearer secretToken123',
            'x-api-key': 'apiKeyVal',
          },
          cookies: 'session=secretCookie',
          data: {
            password: 'leakPassword',
            card: '4111111111111111',
          },
        },
        exception: {
          values: [
            {
              type: 'DatabaseError',
              value:
                'Connection lost to postgresql://admin:secretPass@localhost:5432/db',
              stacktrace: {
                frames: [
                  {
                    filename: 'repo.ts',
                    vars: {
                      dbPassword: 'secretPass',
                      query: 'SELECT * FROM users',
                    },
                  },
                ],
              },
            },
          ],
        },
        extra: {
          webhookSecret: 'whsec_abcdef1234567890abcdef1234567890',
        },
      };

      const scrubbed = scrubSentryEvent(event);

      expect(scrubbed.message).toContain('[REDACTED_STRIPE_KEY]');
      expect(scrubbed.request.url).toContain('token=%5BREDACTED%5D');
      expect(scrubbed.request.headers.authorization).toBe(REDACTED_CENSOR);
      expect(scrubbed.request.cookies).toBe(REDACTED_CENSOR);
      expect(scrubbed.request.data.password).toBe(REDACTED_CENSOR);
      expect(scrubbed.request.data.card).toBe(REDACTED_CENSOR);
      expect(scrubbed.exception.values[0].value).toContain(
        'postgresql://admin:[REDACTED]@localhost:5432/db',
      );
      expect(
        scrubbed.exception.values[0].stacktrace.frames[0].vars.dbPassword,
      ).toBe(REDACTED_CENSOR);
      expect(scrubbed.exception.values[0].stacktrace.frames[0].vars.query).toBe(
        'SELECT * FROM users',
      );
      expect(scrubbed.extra.webhookSecret).toBe(REDACTED_CENSOR);
    });
  });

  describe('AllExceptionsFilter Sanitization', () => {
    it('redacts sensitive information in error stack and incident events', () => {
      const mockReply = vi.fn();
      const mockGetRequestUrl = vi
        .fn()
        .mockReturnValue('/api/v1/auth?token=privateToken');
      const mockGetRequestMethod = vi.fn().mockReturnValue('GET');

      const mockHttpAdapterHost = {
        httpAdapter: {
          reply: mockReply,
          getRequestUrl: mockGetRequestUrl,
          getRequestMethod: mockGetRequestMethod,
        },
      } as unknown as HttpAdapterHost;

      const mockEventEmitter = {
        emit: vi.fn(),
      } as unknown as EventEmitter2;

      const filter = new AllExceptionsFilter(
        mockHttpAdapterHost,
        mockEventEmitter,
      );

      const mockHost = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: { 'x-correlation-id': 'corr-123' } }),
          getResponse: () => ({}),
        }),
      } as any;

      const rawError = new Error(
        'Database failure at postgresql://user:myDbPassword@localhost:5432/prod with sk_live_51OzTestKey123456789012345678',
      );

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      filter.catch(rawError, mockHost);

      expect(mockReply).toHaveBeenCalledTimes(1);
      const [_responseTarget, responseBody, status] = mockReply.mock.calls[0];
      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);

      // Path should be sanitized
      expect(responseBody.path).toBe('/api/v1/auth?token=%5BREDACTED%5D');
      expect(responseBody.path).not.toContain('privateToken');

      // Response details should not contain raw database password or stripe key
      expect(responseBody.details).toContain(
        'postgresql://user:[REDACTED]@localhost:5432/prod',
      );
      expect(responseBody.details).toContain('[REDACTED_STRIPE_KEY]');
      expect(responseBody.details).not.toContain('myDbPassword');
      expect(responseBody.details).not.toContain(
        'sk_live_51OzTestKey123456789012345678',
      );

      // Incident event payload should also be scrubbed
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'system.incident',
        expect.any(Object),
      );
      const incidentPayload = (mockEventEmitter.emit as any).mock.calls[0][1];

      expect(incidentPayload.message).toContain(
        'postgresql://user:[REDACTED]@localhost:5432/prod',
      );
      expect(incidentPayload.stack).toContain('[REDACTED_STRIPE_KEY]');
      expect(incidentPayload.stack).not.toContain('myDbPassword');
      expect(incidentPayload.path).toBe('/api/v1/auth?token=%5BREDACTED%5D');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('SlackService.sendProductionAlert Sanitization', () => {
    it('sanitizes paths, error messages, and stack traces before creating Slack blocks', async () => {
      const mockPrisma = {} as any;
      const mockEmail = {} as any;
      const mockAi = {} as any;
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === 'SLACK_WEBHOOK_ALERTS')
            return 'https://hooks.slack.com/services/mock/alert';
          return undefined;
        }),
      } as any;

      const service = new SlackService(
        mockPrisma,
        mockEmail,
        mockAi,
        mockConfig,
      );
      const sendMessageSpy = vi
        .spyOn(service as any, 'sendMessage')
        .mockResolvedValue(undefined);

      await service.sendProductionAlert({
        path: '/api/v1/billing?secretKey=stripe_secret_param',
        message:
          'Payment failed: sk_live_51OzTestKey123456789012345678 returned 400 for user eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        stack:
          'Error: failed connection postgresql://db_user:mySuperSecretPass@db.internal:5432/circlesfera',
        correlationId: 'test-corr-id',
      });

      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      const [webhookUrl, payload] = sendMessageSpy.mock.calls[0];

      expect(webhookUrl).toBe('https://hooks.slack.com/services/mock/alert');
      const payloadString = JSON.stringify(payload);

      // Ensure no raw secrets exist anywhere in the payload
      expect(payloadString).not.toContain('stripe_secret_param');
      expect(payloadString).not.toContain(
        'sk_live_51OzTestKey123456789012345678',
      );
      expect(payloadString).not.toContain('mySuperSecretPass');
      expect(payloadString).toContain('secretKey=%5BREDACTED%5D');
      expect(payloadString).toContain('[REDACTED_STRIPE_KEY]');
      expect(payloadString).toContain('[REDACTED_JWT]');
      expect(payloadString).toContain(
        'postgresql://db_user:[REDACTED]@db.internal:5432/circlesfera',
      );
    });
  });
});
