import { describe, expect, it } from 'vitest';
import type { Conversation } from '../../types';
import { updateConversationCache } from './conversationCache';

const c = (id: string) => ({ id }) as Conversation;
const ids = (list: Conversation[]) => list.map((x) => x.id);

describe('updateConversationCache', () => {
  it('changes a whole list as it is', () => {
    const out = updateConversationCache([c('a'), c('b')], (l) =>
      l.filter((x) => x.id !== 'a'),
    ) as Conversation[];

    expect(ids(out)).toEqual(['b']);
  });

  it('keeps the pages, their sizes and the cursor of each when one moves to the top', () => {
    const pages = {
      pages: [
        { items: [c('a'), c('b')], nextCursor: 'p2' },
        { items: [c('c'), c('d')], nextCursor: null },
      ],
      pageParams: [null, 'p2'],
    };

    const out = updateConversationCache(pages, (l) => [
      l[3],
      ...l.slice(0, 3),
    ]) as typeof pages;

    expect(out.pages.map((p) => ids(p.items))).toEqual([
      ['d', 'a'],
      ['b', 'c'],
    ]);
    expect(out.pages.map((p) => p.nextCursor)).toEqual(['p2', null]);
    expect(out.pageParams).toEqual([null, 'p2']);
  });

  it('takes a removed conversation out of the last page it shortens', () => {
    const pages = {
      pages: [
        { items: [c('a'), c('b')], nextCursor: 'p2' },
        { items: [c('c')], nextCursor: null },
      ],
      pageParams: [null, 'p2'],
    };

    const out = updateConversationCache(pages, (l) =>
      l.filter((x) => x.id !== 'a'),
    ) as typeof pages;

    expect(out.pages.map((p) => ids(p.items))).toEqual([['b', 'c'], []]);
  });

  it('returns the same cache when nothing changes, and leaves anything else alone', () => {
    const pages = { pages: [{ items: [c('a')], nextCursor: null }] };

    expect(updateConversationCache(pages, (l) => l)).toBe(pages);
    expect(updateConversationCache(undefined, (l) => l)).toBeUndefined();
  });
});
