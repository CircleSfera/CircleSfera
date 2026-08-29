export function usableWebhookSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.includes('CHANGE_ME') || value.includes('dummy')) return null;
  return value;
}

/** Platform secret first, then Connected-accounts destination. */
export function stripeWebhookSecrets(env: {
  platform?: string;
  connect?: string;
}): string[] {
  const secrets: string[] = [];
  const platform = usableWebhookSecret(env.platform);
  const connect = usableWebhookSecret(env.connect);
  if (platform) secrets.push(platform);
  if (connect) secrets.push(connect);
  return secrets;
}
