/** The most chats a Profile can pin at the top of its inbox. */
export const CHAT_PINS_MAX = 3;

/** How long a chat can be muted for; "always" is until it is turned back on. */
export const CHAT_MUTE_DURATIONS = ['1h', '8h', '1w', 'always'] as const;
export type ChatMuteDuration = (typeof CHAT_MUTE_DURATIONS)[number];

/** The most chats one message can be forwarded to at once. */
export const CHAT_FORWARD_MAX = 5;
