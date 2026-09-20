import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from './common/observability/redaction.util.js';

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: isProd ? 0.1 : 1.0,
  profilesSampleRate: isProd ? 0.1 : 1.0,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubSentryBreadcrumb(breadcrumb);
  },
});

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import qs from 'qs';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter.js';
import { doubleCsrfProtection } from './common/config/csrf.config.js';
import {
  createCspDirectives,
  deriveWebSocketOrigins,
  parseAllowedOrigins,
} from './common/config/origin.config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    bufferLogs: true,
    rawBody: true,
  });

  app.useLogger(app.get(Logger));

  // Trust reverse proxies (Nginx / Cloudflare / Docker ingress) for correct IP rate-limiting
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // Hardened query parser: bounds length, depth, parameter count, and blocks prototype pollution
  app
    .getHttpAdapter()
    .getInstance()
    .set('query parser', (str: string) => {
      const boundedStr =
        typeof str === 'string' && str.length > 4096 ? str.slice(0, 4096) : str;
      return qs.parse(boundedStr, {
        depth: 5,
        parameterLimit: 100,
        arrayLimit: 50,
        allowPrototypes: false,
      });
    });

  // Enable CORS with strict origin check
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  const allowedOrigins = parseAllowedOrigins(corsOrigin, isProduction);
  const allowedWsOrigins = deriveWebSocketOrigins(allowedOrigins);
  const livekitUrl = configService.get<string>('LIVEKIT_URL');
  const cdnUrl = configService.get<string>('CDN_URL');

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Security Headers: Segmented least-privilege CSP
  // Standard API endpoints (/api/v1/*) disallow unsafe-inline scripts.
  // Documentation routes (/api/docs) permit Swagger UI bundles.
  const strictCspDirectives = createCspDirectives({
    allowedOrigins,
    allowedWsOrigins,
    livekitUrl,
    cdnUrl,
    isProd: isProduction,
    isSwagger: false,
  });

  const swaggerCspDirectives = createCspDirectives({
    allowedOrigins,
    allowedWsOrigins,
    livekitUrl,
    cdnUrl,
    isProd: isProduction,
    isSwagger: true,
  });

  const strictHelmetMiddleware = helmet({
    contentSecurityPolicy: {
      directives: strictCspDirectives,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  const swaggerHelmetMiddleware = helmet({
    contentSecurityPolicy: {
      directives: swaggerCspDirectives,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = req.path || req.url || '';
    if (path.startsWith('/api/docs')) {
      swaggerHelmetMiddleware(req, res, next);
    } else {
      strictHelmetMiddleware(req, res, next);
    }
  });

  // Parse cookies (required for HTTP-only JWT cookie auth)
  app.use(cookieParser());

  // Global API Prefix
  app.setGlobalPrefix('api/v1');

  // CSRF Protection
  app.use((req: Request, res: Response, next: NextFunction) => {
    const pathToCheck = (req.originalUrl || req.path || '').split('?')[0];
    const normalizedPath =
      pathToCheck.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

    const isExcluded =
      normalizedPath.includes('/auth/login') ||
      normalizedPath.includes('/auth/register') ||
      normalizedPath.includes('/auth/refresh') ||
      normalizedPath.includes('/auth/verify-email') ||
      normalizedPath.includes('/auth/request-reset') ||
      normalizedPath.includes('/auth/reset-password') ||
      normalizedPath.includes('/auth/passkey/login-options') ||
      normalizedPath.includes('/auth/passkey/login-verify') ||
      normalizedPath.includes('/admin-auth/login') ||
      normalizedPath.includes('/admin-auth/mfa/verify') ||
      normalizedPath.includes('/admin-auth/refresh') ||
      normalizedPath.includes('/csrf-token') ||
      normalizedPath.includes('/payments/webhook') ||
      normalizedPath.includes('/socket.io');

    if (isExcluded) {
      next();
    } else {
      doubleCsrfProtection(req, res, next);
    }
  });

  // Const { httpAdapter } = app.get(HttpAdapterHost);
  // Exception filter is registered via APP_FILTER in AppModule (with SlackService DI).
  // Do not register a second instance here.

  // Stripe Webhook needs raw body for signature verification (bounded to 1MB)
  app.use(
    '/api/v1/payments/webhook',
    bodyParser.raw({ type: 'application/json', limit: '1mb' }),
  );

  // Use sensible global body parser limits (DoS protection)
  // Bounded to 2MB for JSON and URL-encoded payloads; file uploads go through multipart
  app.use(bodyParser.json({ limit: '2mb' }));
  app.use(
    bodyParser.urlencoded({
      limit: '2mb',
      extended: true,
      parameterLimit: 1000,
    }),
  );

  // WebSocket Redis Adapter
  const redisIoAdapter = new RedisIoAdapter(app, configService);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CircleSfera API')
    .setDescription(
      'Interactive API documentation for CircleSfera social platform',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('PORT') || 3000;

  // Final Security Check: Ensure critical secrets are set and strong
  if (configService.get('NODE_ENV') !== 'test') {
    const secrets = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'CSRF_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'ENCRYPTION_KEY',
      'ABUSE_HASH_PEPPER',
    ];
    for (const key of secrets) {
      const val = configService.get<string>(key);
      const isProd = configService.get('NODE_ENV') === 'production';

      if (
        !val ||
        (isProd &&
          (val.length < 32 ||
            val.includes('CHANGE_ME') ||
            val.includes('dummy') ||
            val === 'default-secret-key-32-chars-long!'))
      ) {
        throw new Error(
          `SECURITY ALERT: ${key} is missing, too weak, or contains placeholder values.`,
        );
      }
      // JWT/CSRF still require stronger secrets in production
      if (
        isProd &&
        (key === 'JWT_SECRET' ||
          key === 'JWT_REFRESH_SECRET' ||
          key === 'CSRF_SECRET') &&
        val.length < 64
      ) {
        throw new Error(
          `SECURITY ALERT: ${key} must be at least 64 characters in production.`,
        );
      }
    }

    if (configService.get('NODE_ENV') === 'production') {
      const openAi = configService.get<string>('OPENAI_API_KEY');
      if (!openAi || openAi.includes('CHANGE_ME') || openAi.includes('dummy')) {
        throw new Error(
          'SECURITY ALERT: OPENAI_API_KEY is required in production.',
        );
      }
      const livekitKey = configService.get<string>('LIVEKIT_API_KEY');
      const livekitSecret = configService.get<string>('LIVEKIT_API_SECRET');
      if (!livekitKey || !livekitSecret) {
        throw new Error(
          'SECURITY ALERT: LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production.',
        );
      }
      const turnstile = configService.get<string>('TURNSTILE_SECRET_KEY');
      if (!turnstile || turnstile.includes('CHANGE_ME')) {
        throw new Error(
          'SECURITY ALERT: TURNSTILE_SECRET_KEY is required in production.',
        );
      }
    }
  }

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

void bootstrap();
