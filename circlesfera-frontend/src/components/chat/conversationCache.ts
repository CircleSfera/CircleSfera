import type { InfiniteData } from '@tanstack/react-query';
import type { ConversationPage } from '../../services/chat.service';
import type { Conversation } from '../../types';

// The conversation caches hold either a whole list (the share sheet) or the
// pages of the list read so far (the inbox and the requests). An update is
// written once, for a plain list, and applied to both: the pages are joined,
// changed and cut again at the same sizes, so the place each page ended,
// and the cursor of the next one, stay where the server put them.
export function updateConversationCache(
  prev: unknown,
  update: (list: Conversation[]) => Conversation[],
): unknown {
  if (Array.isArray(prev)) return update(prev as Conversation[]);
  const data = prev as InfiniteData<ConversationPage> | undefined;
  if (!data?.pages) return prev;
  const before = data.pages.flatMap((p) => p.items);
  const after = update(before);
  if (after === before) return prev;
  let at = 0;
  const pages = data.pages.map((page, i) => {
    const size =
      i === data.pages.length - 1 ? after.length - at : page.items.length;
    const items = after.slice(at, at + size);
    at += size;
    return { ...page, items };
  });
  return { ...data, pages };
}
