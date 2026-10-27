import type { MessageKind } from '@prisma/client';

// A notice from the app in a chat, such as someone becoming admin, rather
// than a message a member wrote. Nobody edits, deletes, reacts to, replies
// to or reports one. A message without a kind was written by a member.
export function isNotice(message: { kind?: MessageKind | null }): boolean {
  return message.kind != null && message.kind !== 'USER';
}
