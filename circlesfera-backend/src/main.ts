import './instrument.js';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter.js';
import { doubleCsrfProtection } from './common/config/csrf.config.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    bufferLogs: true,
    rawBody: true,
  });

  app.useLogger(app.get(Logger));

  // Enable CORS with strict origin check
  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  if (!corsOrigin && configService.get('NODE_ENV') === 'production') {
    throw new Error(
      'CORS_ORIGIN environment variable is required in production',
    );
  }

  const allowedOrigins = corsOrigin
    ? corsOrigin.split(',').map((o) => o.trim())
    : [
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:8081',
        'http://[::1]:5173',
      ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Security Headers (Strict CSP + defaults)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: [
            "'self'",
            'data:',
            'https://res.cloudinary.com',
            ...allowedOrigins,
          ],
          mediaSrc: ["'self'", ...allowedOrigins, 'blob:'],
          connectSrc: ["'self'", ...allowedOrigins, 'wss://*'],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow frontend to access media
    }),
  );

  // Parse cookies (required for HTTP-only JWT cookie auth)
  app.use(cookieParser());

  // Global API Prefix
  app.setGlobalPrefix('api/v1');

  // CSRF Protection
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Normalize path: Remove double slashes and trailing slashes
    const normalizedPath =
      req.path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    const excludedPaths = [
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/refresh',
      '/api/v1/auth/verify-email',
      '/api/v1/auth/request-reset',
      '/api/v1/auth/reset-password',
      '/api/v1/auth/passkey/login-options',
      '/api/v1/auth/passkey/login-verify',
      '/api/v1/csrf-token',
      '/api/v1/payments/webhook',
    ];

    if (
      excludedPaths.includes(normalizedPath) ||
      normalizedPath.startsWith('/socket.io') ||
      normalizedPath.startsWith('/api/v1/socket.io')
    ) {
      next();
    } else {
      doubleCsrfProtection(req, res, next);
    }
  });

  // const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  // Stripe Webhook needs raw body for signature verification
  app.use(
    '/api/v1/payments/webhook',
    bodyParser.raw({ type: 'application/json' }),
  );

  // Use sensible global body parser limits (Dos protection)
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

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
    ];
    for (const key of secrets) {
      const val = configService.get<string>(key);
      const isProd = configService.get('NODE_ENV') === 'production';

      if (
        !val ||
        (isProd &&
          (val.length < 64 ||
            val.includes('CHANGE_ME') ||
            val.includes('dummy')))
      ) {
        throw new Error(
          `SECURITY ALERT: ${key} is missing, too weak, or contains placeholder values.`,
        );
      }
    }
  }

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

void bootstrap();
