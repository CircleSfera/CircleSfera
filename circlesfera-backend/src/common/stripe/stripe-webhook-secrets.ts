// The webhook signing secret, unless it is missing or a placeholder.
export function usableWebhookSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.includes('CHANGE_ME') || value.includes('dummy')) return null;
  return value;
}
