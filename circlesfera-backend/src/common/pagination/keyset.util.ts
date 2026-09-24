export interface KeysetCursor {
  createdAt: Date;
  id: string;
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
 * next cursor (the last row's id), or undefined if that extra row wasn't
 * present (no further pages).
 */
export function toKeysetPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): KeysetPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return { data, nextCursor: hasMore && last ? last.id : undefined };
}
