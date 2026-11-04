/**
 * A comment on a live, as the server sends it to everyone in the live's
 * room (`live:chat_message`), the one who wrote it included. It is written
 * by a Profile: the one the person is using, not another of their account.
 */
export interface LiveChatMessage {
  id: string;
  profile: LiveChatAuthor;
  message: string;
  timestamp: string;
}

export interface LiveChatAuthor {
  id: string;
  username: string;
  avatar: string | null;
}
