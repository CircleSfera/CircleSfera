/**
 * An email that arrived, in the words of the Help Desk. The host turns what
 * its mail provider sends into this; the Help Desk knows no provider.
 */
export interface InboundEmail {
  /** The Message-ID of the email, when it has one. */
  messageId?: string | null;
  from: string;
  /** Every address it was sent to. */
  to: string[];
  subject?: string | null;
  /** Its text; without quoted replies and signature when the provider cut them. */
  text?: string | null;
  spamScore?: number | null;
  attachmentCount?: number;
  /** Its headers, by name. A header that repeats may be a list. */
  headers?: Record<string, unknown>;
}

const header = (headers: Record<string, unknown>, name: string): string => {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    return (Array.isArray(value) ? value.join(' ') : String(value ?? ''))
      .trim()
      .toLowerCase();
  }
  return '';
};

/**
 * Whether a machine sent an email: an out-of-office answer, a bounce, a
 * list. Such mail is never answered, so that two machines do not write to
 * each other.
 */
export function isAutomatedMail(email: InboundEmail): boolean {
  const headers = email.headers ?? {};
  const autoSubmitted = header(headers, 'Auto-Submitted');
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (/^(bulk|junk|list|auto_reply)/.test(header(headers, 'Precedence'))) {
    return true;
  }
  if (
    [
      'X-Autoreply',
      'X-Autorespond',
      'X-Auto-Response-Suppress',
      'List-Id',
      'List-Unsubscribe',
    ].some((name) => header(headers, name) !== '')
  ) {
    return true;
  }
  const sender = email.from.trim().toLowerCase().split('@')[0];
  return /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?)([+.-]|$)/.test(
    sender,
  );
}
