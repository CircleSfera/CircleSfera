import type { Prisma } from '@prisma/client';

type Client = Pick<Prisma.TransactionClient, 'comment'>;

const FILES = { url: true, standardUrl: true, thumbnailUrl: true } as const;

// Replies of replies are followed this deep at most.
const MAX_DEPTH = 20;

/**
 * Every file address of the comments that match, and of all their replies:
 * deleting a comment deletes its replies, and deleting a post deletes its
 * comments, with no code of ours in between. Read before the rows go, so
 * that the files can be settled once they have.
 */
export async function commentFiles(
  client: Client,
  where: Prisma.CommentWhereInput,
): Promise<string[]> {
  const files = new Set<string>();
  const seen = new Set<string>();
  let next: Prisma.CommentWhereInput = where;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
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
    next = { parentId: { in: fresh.map((row) => row.id) } };
  }
  return [...files];
}
