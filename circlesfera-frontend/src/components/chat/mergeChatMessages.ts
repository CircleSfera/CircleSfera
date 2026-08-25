import type { Message } from '../../types';

/**
 * Keep optimistic/temp messages that the server list has not caught up with
 * yet, so an in-flight history fetch cannot wipe a just-sent bubble.
 */
export function mergeServerMessagesWithOptimistic(
  serverMessages: Message[],
  localMessages: Message[],
): Message[] {
  const pending = localMessages.filter((local) => {
    if (!local.tempId) return false;
    return !serverMessages.some(
      (server) =>
        server.id === local.id ||
        (server.senderId === local.senderId &&
          server.content === local.content),
    );
  });
  return pending.length > 0 ? [...serverMessages, ...pending] : serverMessages;
}

export function upsertSentMessage(prev: Message[], sent: Message): Message[] {
  if (sent.tempId) {
    const byTemp = prev.findIndex((m) => m.tempId === sent.tempId);
    if (byTemp !== -1) {
      const next = [...prev];
      next[byTemp] = sent;
      return next;
    }
  }
  if (sent.id && prev.some((m) => m.id === sent.id)) return prev;
  return [...prev, sent];
}
