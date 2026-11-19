import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';

// Whether PostgreSQL ended a transaction to break a deadlock (40P01) or a
// write conflict (40001): Prisma reports both as P2034. The transaction did
// nothing and can run again.
export function isDeadlock(error: unknown): boolean {
  const { code, message } = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
  };
  return (
    code === 'P2034' || /40P01|deadlock detected/i.test(String(message ?? ''))
  );
}

// Runs a whole transaction again when PostgreSQL chose it to break a
// deadlock, up to `attempts` times in all.
export async function retryOnDeadlock<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isDeadlock(error)) throw error;
    }
  }
}

// Deletes refresh tokens, which closes their sessions, only after any renewal
// of those sessions in progress has finished.
//
// A renewal locks its session's tokens while it revokes the token it was sent
// and writes the next one (ADR-0032). The tokens to delete are locked here
// first, in id order, so this waits for such a renewal; the delete, a later
// statement, then also sees the token it wrote. Without the lock, a sign-out,
// password change or ban that ran while a renewal held its tokens left that
// new token live.
//
// Inside a caller's transaction (`tx`) it runs there; otherwise it opens its
// own, and runs it again if PostgreSQL ends it to break a deadlock with a
// renewal.
export async function deleteRefreshTokens(
  prisma: PrismaService,
  where: Prisma.RefreshTokenWhereInput,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const run = async (db: Prisma.TransactionClient) => {
    const rows = await db.refreshToken.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (rows.length > 0) {
      const ids = Prisma.join(rows.map((row) => row.id));
      await db.$queryRaw`SELECT id FROM refresh_tokens WHERE id IN (${ids}) ORDER BY id FOR UPDATE`;
    }
    const { count } = await db.refreshToken.deleteMany({ where });
    return count;
  };
  if (tx) return run(tx);
  return retryOnDeadlock(() => prisma.$transaction((own) => run(own)));
}
