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
  isTestAccount?: boolean;
}

/**
 * Build unpersisted User attributes for unit testing. The credentials are
 * not on the account: see buildSignInAttributes.
 */
export async function buildUserAttributes(
  overrides: UserFactoryOverrides = {},
): Promise<Prisma.UserCreateInput> {
  const suffix = generateTestSuffix();
  return {
    email: overrides.email ?? `user_${suffix}@circlesfera.test`,
    role: overrides.role ?? 'USER',
    isActive: overrides.isActive ?? true,
    isTestAccount: overrides.isTestAccount ?? false,
    dateOfBirth: overrides.dateOfBirth ?? new Date('1995-05-15'),
  };
}

/**
 * Build the credentials of the account's sign-in: the password hash and
 * whether the email is verified (verified unless told otherwise).
 */
export async function buildSignInAttributes(
  overrides: Pick<UserFactoryOverrides, 'password' | 'emailVerified'> = {},
): Promise<{ password: string; emailVerified: Date | null }> {
  return {
    password: await getTestPasswordHash(overrides.password ?? 'Password123!'),
    emailVerified:
      overrides.emailVerified !== undefined
        ? overrides.emailVerified
        : new Date(),
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
  // Its sign-in, with the credentials; the Profiles created later sign in
  // with it.
  await prisma.signIn.create({
    data: {
      userId: user.id,
      email: user.email,
      ...(await buildSignInAttributes(overrides)),
    },
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
