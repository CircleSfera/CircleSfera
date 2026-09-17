import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient, Role, User } from '@prisma/client';
import argon2 from 'argon2';

let cachedPasswordHash: string | null = null;

export async function getTestPasswordHash(
  password = 'Password123!',
): Promise<string> {
  if (password === 'Password123!' && cachedPasswordHash) {
    return cachedPasswordHash;
  }
  const hash = await argon2.hash(password);
  if (password === 'Password123!') {
    cachedPasswordHash = hash;
  }
  return hash;
}

export function generateTestSuffix(): string {
  return `${process.pid.toString(36)}${randomBytes(4).toString('hex')}`;
}

export function generateTestEmail(prefix = 'testuser'): string {
  return `${prefix}_${generateTestSuffix()}@circlesfera.test`;
}

export function generateTestUsername(prefix = 'user'): string {
  return `${prefix}_${generateTestSuffix()}`.slice(0, 24);
}

export interface UserFactoryOverrides {
  email?: string;
  password?: string;
  role?: Role;
  isActive?: boolean;
  emailVerified?: Date | null;
  dateOfBirth?: Date;
  createSettings?: boolean;
}

/**
 * Build unpersisted User attributes for unit testing.
 */
export async function buildUserAttributes(
  overrides: UserFactoryOverrides = {},
): Promise<Prisma.UserCreateInput> {
  const suffix = generateTestSuffix();
  const rawPassword = overrides.password ?? 'Password123!';
  const hashedPassword = await getTestPasswordHash(rawPassword);

  return {
    email: overrides.email ?? `user_${suffix}@circlesfera.test`,
    password: hashedPassword,
    role: overrides.role ?? 'USER',
    isActive: overrides.isActive ?? true,
    emailVerified:
      overrides.emailVerified !== undefined
        ? overrides.emailVerified
        : new Date(),
    dateOfBirth: overrides.dateOfBirth ?? new Date('1995-05-15'),
  };
}

/**
 * Create and persist a User with standard UserSettings in the database.
 */
export async function createUser(
  prisma: PrismaClient,
  overrides: UserFactoryOverrides = {},
): Promise<User> {
  const data = await buildUserAttributes(overrides);

  const user = await prisma.user.create({
    data,
  });

  const shouldCreateSettings = overrides.createSettings ?? true;
  if (shouldCreateSettings) {
    await prisma.userSettings.create({
      data: {
        userId: user.id,
        isOnboarded: true,
        privacyLevel: 'PUBLIC',
        contentPreference: 'GENERAL',
        emailNotifications: true,
        pushNotifications: true,
      },
    });
  }

  return user;
}
