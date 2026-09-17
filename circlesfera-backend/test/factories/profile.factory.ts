import type {
  AccountType,
  Prisma,
  PrismaClient,
  Profile,
  User,
  VerificationLevel,
} from '@prisma/client';
import {
  createUser,
  generateTestSuffix,
  generateTestUsername,
  type UserFactoryOverrides,
} from './user.factory.js';

export interface ProfileFactoryOverrides {
  username?: string;
  fullName?: string;
  bio?: string;
  avatar?: string;
  accountType?: AccountType;
  verificationLevel?: VerificationLevel;
  location?: string;
  website?: string;
}

/**
 * Build unpersisted Profile attributes.
 */
export function buildProfileAttributes(
  userId: string,
  overrides: ProfileFactoryOverrides = {},
): Prisma.ProfileCreateUncheckedInput {
  const suffix = generateTestSuffix();
  return {
    userId,
    username: overrides.username ?? generateTestUsername('profile'),
    fullName: overrides.fullName ?? `Test User ${suffix}`,
    bio: overrides.bio ?? 'Deterministic factory test profile bio.',
    avatar:
      overrides.avatar ??
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    accountType: overrides.accountType ?? 'PERSONAL',
    verificationLevel: overrides.verificationLevel ?? 'BASIC',
    location: overrides.location ?? 'Madrid, Spain',
    website: overrides.website ?? 'https://circlesfera.com',
  };
}

/**
 * Create and persist a Profile linked to an existing User.
 */
export async function createProfile(
  prisma: PrismaClient,
  userId: string,
  overrides: ProfileFactoryOverrides = {},
): Promise<Profile> {
  const data = buildProfileAttributes(userId, overrides);
  return prisma.profile.create({
    data,
  });
}

/**
 * Create both a User and their primary Profile atomically.
 */
export async function createUserWithProfile(
  prisma: PrismaClient,
  options: {
    user?: UserFactoryOverrides;
    profile?: ProfileFactoryOverrides;
  } = {},
): Promise<{ user: User; profile: Profile }> {
  const user = await createUser(prisma, options.user);
  const profile = await createProfile(prisma, user.id, options.profile);
  return { user, profile };
}
