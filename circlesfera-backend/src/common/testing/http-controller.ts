import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  type INestApplication,
  type Provider,
  type Type,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { CurrentAdminData } from '../../auth/decorators/current-admin.decorator.js';
import type { CurrentUserData } from '../../auth/decorators/current-user.decorator.js';
import {
  ACCESS_TOKEN_COOKIE,
  ADMIN_ACCESS_TOKEN_COOKIE,
} from '../config/cookie.config.js';

/** Session identity attached when a test sends Bearer/cookie credentials. */
export const TEST_USER: CurrentUserData = {
  userId: 'user-1',
  email: 'test@example.com',
  role: 'USER',
  profileId: 'profile-1',
};

export const TEST_ADMIN: CurrentAdminData = {
  adminId: 'admin-1',
  userId: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Test Admin',
  permissions: [
    'reports',
    'appeals',
    'moderation',
    'users.read',
    'users.write',
    'users.ban',
    'payments',
    'system',
    'experiments',
    'support',
    'audit',
    'live',
    'content',
    'admins.manage',
  ],
  roles: ['SUPER_ADMIN'],
  stepUpVerified: true,
};

/** User JWT stub. Admin routes reject this (401). */
export const BEARER = { Authorization: 'Bearer test' } as const;

/** Admin JWT stub. User session guards reject this (401). */
export const ADMIN_BEARER = { Authorization: 'Bearer admin' } as const;

export const TEST_UUID = '11111111-1111-4111-8111-111111111111';

function authHeader(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const auth = req.headers?.authorization;
  return Array.isArray(auth) ? auth[0] : auth;
}

function hasUserCredential(req: {
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}): boolean {
  const header = authHeader(req);
  if (header === 'Bearer test') return true;
  if (req.cookies?.[ACCESS_TOKEN_COOKIE]) return true;
  return false;
}

function hasAdminCredential(req: {
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}): boolean {
  const header = authHeader(req);
  if (header === 'Bearer admin') return true;
  if (req.cookies?.[ADMIN_ACCESS_TOKEN_COOKIE]) return true;
  return false;
}

export function requireSession(user: object = TEST_USER): CanActivate {
  return {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      if (!hasUserCredential(req)) {
        throw new UnauthorizedException();
      }
      req.user = user;
      return true;
    },
  };
}

export function requireAdmin(admin: object = TEST_ADMIN): CanActivate {
  return {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      if (!hasAdminCredential(req)) {
        throw new UnauthorizedException();
      }
      req.user = admin;
      return true;
    },
  };
}

export function optionalSession(user: object = TEST_USER): CanActivate {
  return {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      if (hasUserCredential(req)) {
        req.user = user;
      }
      return true;
    },
  };
}

export function allowAll(): CanActivate {
  return { canActivate: () => true };
}

export function forbidAll(message?: string): CanActivate {
  return {
    canActivate(): never {
      throw new ForbiddenException(message);
    },
  };
}

export type GuardMode = 'session' | 'admin' | 'optional' | 'allow' | 'forbid';

export type GuardOverride = {
  guard: Type;
  mode: GuardMode;
  forbidMessage?: string;
};

/**
 * Nest HTTP app for a single controller: same ValidationPipe as AppModule,
 * `/api/v1` prefix. Session guards reject missing Bearer/cookie (401).
 */
export async function createControllerApp(opts: {
  controllers: Type[];
  providers: Provider[];
  guards?: GuardOverride[];
  user?: CurrentUserData;
  admin?: CurrentAdminData;
}): Promise<INestApplication> {
  const user = opts.user ?? TEST_USER;
  const admin = opts.admin ?? TEST_ADMIN;

  const providers: Provider[] = [
    ...opts.providers,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ];

  let builder = Test.createTestingModule({
    controllers: opts.controllers,
    providers,
  });

  for (const g of opts.guards ?? []) {
    const impl =
      g.mode === 'session'
        ? requireSession(user)
        : g.mode === 'admin'
          ? requireAdmin(admin)
          : g.mode === 'optional'
            ? optionalSession(user)
            : g.mode === 'forbid'
              ? forbidAll(g.forbidMessage)
              : allowAll();
    builder = builder.overrideGuard(g.guard).useValue(impl);
  }

  const module = await builder.compile();
  const app = module.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  await app.init();
  return app;
}
