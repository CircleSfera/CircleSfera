export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

/**
 * Encodes a (createdAt, id) pair as an opaque cursor string. Deliberately
 * self-contained — decoding never requires a database lookup, so a cursor
 * stays resolvable even after the row it was minted from is deleted
 * (unfollow, comment delete, story cascade, ...). A cursor keyed on just the
 * row id would go stale the moment that row disappears, silently resetting
 * pagination to page 1 instead of continuing correctly.
 */
export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

/**
 * Decodes a cursor produced by encodeKeysetCursor. Returns null for
 * anything malformed or unparseable — callers should treat that the same
 * as "no cursor" (start from page 1) rather than throwing.
 */
export function decodeKeysetCursor(encoded: string): KeysetCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.id !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * WHERE fragment for descending (createdAt, id) keyset pagination: matches
 * rows strictly before the cursor in (createdAt DESC, id DESC) order. Stable
 * under concurrent inserts, unlike skip/take — a new row ahead of the cursor
 * never shifts already-fetched pages.
 */
export function keysetBeforeDesc(cursor: KeysetCursor) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

export interface KeysetPage<T> {
  data: T[];
  nextCursor?: string;
}

/**
 * Splits a page fetched with `take: limit + 1` into the page itself and the
 * next cursor (encoded from the last row's own createdAt/id), or undefined
 * if that extra row wasn't present (no further pages).
 */
export function toKeysetPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
): KeysetPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    nextCursor: hasMore && last ? encodeKeysetCursor(last) : undefined,
  };
}
