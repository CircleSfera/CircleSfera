import type { Prisma } from '@prisma/client';

type Client = Pick<Prisma.TransactionClient, 'comment' | '$queryRaw'>;

const FILES = { url: true, standardUrl: true, thumbnailUrl: true } as const;

/**
 * Every file address of the comments that match, and of all their replies,
 * however deep: deleting a comment deletes its replies, and deleting a post
 * deletes its comments, with no code of ours in between. Read in the
 * transaction that deletes them, before the rows go.
 *
 * Each comment read is locked until that transaction ends. A new reply
 * needs its parent row, so none can be added under a comment already read
 * and then be deleted by the cascade with its files left unsettled.
 */
export async function commentFiles(
  client: Client,
  where: Prisma.CommentWhereInput,
): Promise<string[]> {
  const files = new Set<string>();
  const seen = new Set<string>();
  let next: Prisma.CommentWhereInput = where;
  for (;;) {
    const rows = await client.comment.findMany({
      where: next,
      select: {
        id: true,
        ...FILES,
        voiceUrl: true,
        media: { select: FILES },
        voiceMedia: { select: FILES },
      },
    });
    const fresh = rows.filter((row) => !seen.has(row.id));
    if (fresh.length === 0) break;
    const ids = fresh.map((row) => row.id);
    await client.$queryRaw`SELECT id FROM "comments" WHERE id = ANY(${ids}::text[]) FOR UPDATE`;
    for (const row of fresh) {
      seen.add(row.id);
      for (const address of [
        row.url,
        row.standardUrl,
        row.thumbnailUrl,
        row.voiceUrl,
        row.media?.url,
        row.media?.standardUrl,
        row.media?.thumbnailUrl,
        row.voiceMedia?.url,
        row.voiceMedia?.standardUrl,
        row.voiceMedia?.thumbnailUrl,
      ]) {
        if (address) files.add(address);
      }
    }
    next = { parentId: { in: ids } };
  }
  return [...files];
}
