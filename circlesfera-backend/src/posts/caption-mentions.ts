/**
 * The usernames a caption mentions, once each, without the "@". A mention
 * starts the caption or follows a space, so an e-mail address is not one.
 */
export function captionMentions(caption?: string | null): string[] {
  const mentions = caption ? caption.match(/(?:^|\s)(@[\w.]+)/g) : null;
  return mentions ? [...new Set(mentions.map((m) => m.trim().slice(1)))] : [];
}
