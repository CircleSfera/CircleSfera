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

// Where the mail apps start the email being answered.
const WROTE = /^(on|el)\b.*\b(wrote|escribió)\s*:\s*$/i;
const ORIGINAL =
  /^-{2,}\s*(original message|mensaje original|forwarded message|mensaje reenviado)\s*-{2,}$/i;
const HEADER_FROM = /^\*{0,2}(from|de)\s*:\*{0,2}\s+\S/i;
const HEADER_SENT =
  /^\*{0,2}(sent|enviado|date|fecha)(\s+el)?\s*:\*{0,2}\s+\S/i;
const RULE = /^_{10,}$/;

/**
 * What the sender wrote, without the email they were answering and without
 * their signature. It stops at the first line that starts a quoted email:
 * the "wrote:" line of the common mail apps, in English and Spanish, even
 * when it is split in two; an "Original Message" separator; a block of
 * headers; a quoted line; or the "-- " that opens a signature.
 */
export function cutQuotedText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? '').trim();
    const startsQuote =
      line.startsWith('>') ||
      line === '--' ||
      lines[i] === '-- ' ||
      WROTE.test(line) ||
      // The "wrote:" line of a long sender, broken in two by the mail app.
      (/^(on|el)\b/i.test(line) && WROTE.test(`${line} ${next}`)) ||
      ORIGINAL.test(line) ||
      RULE.test(line) ||
      (HEADER_FROM.test(line) &&
        lines.slice(i + 1, i + 4).some((one) => HEADER_SENT.test(one.trim())));
    if (startsQuote) {
      end = i;
      break;
    }
  }
  return lines.slice(0, end).join('\n').trim();
}
