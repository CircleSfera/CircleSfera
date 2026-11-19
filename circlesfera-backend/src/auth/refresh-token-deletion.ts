import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';

// Deletes refresh tokens, which closes their sessions, only after any renewal
// of those sessions in progress has finished.
//
// A renewal locks its session's tokens while it revokes the token it was sent
// and writes the next one (ADR-0032). The live tokens to delete are locked here
// first, so this waits for such a renewal; the delete, a later statement, then
// also sees the token it wrote. Without the lock, a sign-out, password change
// or ban that ran while a renewal held its tokens left that new token live.
//
// Locks are taken in id order, as the renewal takes them, so the two never
// wait on each other in a circle.
export async function deleteRefreshTokens(
  db: PrismaService | Prisma.TransactionClient,
  where: Prisma.RefreshTokenWhereInput,
): Promise<number> {
  const run = async (tx: Prisma.TransactionClient) => {
    const live = await tx.refreshToken.findMany({
      where: { AND: [where, { isRevoked: false }] },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (live.length > 0) {
      const ids = Prisma.join(live.map((token) => token.id));
      await tx.$queryRaw`SELECT id FROM refresh_tokens WHERE id IN (${ids}) ORDER BY id FOR UPDATE`;
    }
    const { count } = await tx.refreshToken.deleteMany({ where });
    return count;
  };
  return '$transaction' in db ? db.$transaction((tx) => run(tx)) : run(db);
}
