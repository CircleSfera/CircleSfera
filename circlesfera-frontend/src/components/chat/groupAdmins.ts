import type { Conversation, Message, Participant } from '../../types';

// Who the app offers as an admin of a group: members still in it who
// accepted it, other than the person themselves. The server has the last
// word: it also refuses a member whose account is not active.
export function adminCandidates(
  conversation: Pick<Conversation, 'participants'>,
  myProfileId: string | undefined,
): Participant[] {
  return conversation.participants.filter(
    (p) =>
      p.profileId !== myProfileId &&
      p.hasAccepted !== false &&
      !p.deletedAt &&
      !p.isAdmin,
  );
}

// Whether leaving first asks who becomes admin: the person is the only
// admin of the group and another member could be one.
export function needsSuccessor(
  conversation: Pick<Conversation, 'participants' | 'isGroup'>,
  myProfileId: string | undefined,
): boolean {
  if (!conversation.isGroup || !myProfileId) return false;
  const admins = conversation.participants.filter(
    (p) => p.isAdmin && p.hasAccepted !== false && !p.deletedAt,
  );
  const iAmTheOnlyAdmin =
    admins.length === 1 && admins[0].profileId === myProfileId;
  return (
    iAmTheOnlyAdmin && adminCandidates(conversation, myProfileId).length > 0
  );
}

// A notice from the app in the chat, such as someone becoming admin, rather
// than a message a member wrote.
export function isNotice(message: Pick<Message, 'kind'>): boolean {
  return message.kind != null && message.kind !== 'USER';
}
