import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

// The public profile (ProfilesService.getProfile) is cached for 10 minutes
// under a key built from the username. A username is found whatever its case
// ("Ana" at /ana), so the key is built from the name in lower case: a key in
// the case of the address would be one that no write ever drops.
//
// Every read and every drop of that cache builds its key here, so a new
// write path cannot drop a key other than the one the read stored.
export function profileCacheKey(username: string): string {
  return `profile:${username.toLowerCase()}`;
}

const logger = new Logger('ProfileCache');

/**
 * Drops the cached public profile of each username, after a write that
 * changes what it shows: the Profile itself, the standing of its account (a
 * ban, a suspension, a deletion) or what is said about its sign-in. A cache
 * that cannot be reached never fails the write: the view then lasts until it
 * expires.
 */
export async function forgetCachedProfiles(
  cache: Pick<Cache, 'del'>,
  usernames: (string | null | undefined)[],
): Promise<void> {
  await Promise.all(
    usernames
      .filter((username): username is string => !!username)
      .map(async (username) => {
        try {
          await cache.del(profileCacheKey(username));
        } catch (error) {
          logger.warn(`Could not drop a cached profile: ${String(error)}`);
        }
      }),
  );
}

// Only what reading the usernames needs, so this file stays free of the
// Prisma service and any module can use it.
interface ProfileReader {
  profile: {
    findMany(args: {
      where: { userId: string } | { signInId: string };
      select: { username: true };
    }): Promise<{ username: string | null }[]>;
  };
}

/**
 * Drops the cached public profile of every Profile of an account, or of every
 * Profile that signs in with one sign-in: what the account's standing (active,
 * deleted, identity, labels) or the sign-in's confirmed email shows on each.
 */
export async function forgetCachedProfilesOf(
  db: ProfileReader,
  cache: Pick<Cache, 'del'>,
  owner: { userId: string } | { signInId: string },
): Promise<void> {
  try {
    const profiles = await db.profile.findMany({
      where: owner,
      select: { username: true },
    });
    await forgetCachedProfiles(
      cache,
      profiles.map((profile) => profile.username),
    );
  } catch (error) {
    logger.warn(`Could not drop cached profiles: ${String(error)}`);
  }
}
