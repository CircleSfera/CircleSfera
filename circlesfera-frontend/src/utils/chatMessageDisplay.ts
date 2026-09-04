import type { TFunction } from 'i18next';
import type { Message } from '../types';

const SHARED_POST_PREFIXES = [
  /^Shared a post:/i,
  /^Compartió un post:/i,
  /^Compartió una publicación:/i,
];

export function isSharedPostMessage(
  msg: Pick<Message, 'postId' | 'post' | 'content'>,
): boolean {
  if (msg.postId || msg.post) return true;
  if (!msg.content || typeof msg.content !== 'string') return false;
  return SHARED_POST_PREFIXES.some((re) => re.test(msg.content!));
}

export function getMessagePreviewText(
  msg: Message,
  t: TFunction,
): string | null {
  if (msg.isDeleted) {
    return t('chat.message_deleted', {
      defaultValue: 'Este mensaje fue eliminado',
    });
  }
  if (msg.voiceUrl || msg.mediaType === 'audio') return t('chat.sent_voice');
  if (msg.mediaType === 'image') return t('chat.sent_image');
  if (msg.url) return t('chat.sent_attachment');
  if (
    msg.content &&
    typeof msg.content === 'string' &&
    msg.content.includes('"ciphertext"')
  ) {
    return `🔒 ${t('chat.secure_message', 'Mensaje seguro')}`;
  }
  if (isSharedPostMessage(msg)) {
    return t('chat.shared_post', 'Shared a post');
  }
  return msg.content || null;
}

export function getMessageDisplayText(
  msg: Message,
  decryptedText: string,
  t: TFunction,
): string | null {
  if (msg.isDeleted) {
    return t('chat.message_deleted', {
      defaultValue: 'Este mensaje fue eliminado',
    });
  }
  if (isSharedPostMessage(msg) && msg.post) {
    return null;
  }
  if (isSharedPostMessage(msg)) {
    return t('chat.shared_post', 'Shared a post');
  }
  return decryptedText;
}
