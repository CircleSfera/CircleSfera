export function extractHashtags(content: string): string[] {
  if (!content) return [];
  const matches = content.match(/#[\w-]+/g);
  if (!matches) return [];
  // return unique tags without the #, lowercase
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
}

export function extractMentions(content: string): string[] {
  if (!content) return [];
  const matches = content.match(/@[\w.]+/g);
  if (!matches) return [];
  // return unique usernames without the @
  return [...new Set(matches.map((mention) => mention.slice(1)))];
}
