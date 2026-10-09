import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { HelpdeskStore } from './helpdesk.store.js';
import { type InboundEmail, isAutomatedMail } from './helpdesk-inbound.js';
import { HelpdeskReplyAddress } from './helpdesk-reply-address.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// What is kept of the text of an email; a message of a ticket is shorter.
const MAX_KEPT_TEXT = 20_000;
const MAX_KEPT_LINE = 500;

// Email that arrives at the reply addresses of the Help Desk. Each email is
// kept once, for 30 days.
@Injectable()
export class HelpdeskInboundService {
  constructor(
    @Inject(HelpdeskStore) private readonly store: HelpdeskStore,
    @Inject(HelpdeskReplyAddress)
    private readonly replyAddress: HelpdeskReplyAddress,
  ) {}

  /** Whether email in is set up. */
  get enabled(): boolean {
    return this.replyAddress.enabled;
  }

  /**
   * Keeps an email that arrived. The same email delivered again is not kept
   * twice. Returns the id of the kept email and whether it is new.
   */
  async receive(email: InboundEmail): Promise<{ id: string; kept: boolean }> {
    const from = email.from.trim().toLowerCase().slice(0, MAX_KEPT_LINE);
    const recipients = email.to.map((address) => address.trim().toLowerCase());
    // The address that matters is the one at the reply domain.
    const to = (
      recipients.find((address) => this.replyAddress.isReplyDomain(address)) ??
      recipients[0] ??
      ''
    ).slice(0, MAX_KEPT_LINE);
    const subject = (email.subject ?? '').trim().slice(0, MAX_KEPT_LINE);
    const body = (email.text ?? '').trim().slice(0, MAX_KEPT_TEXT);
    // An email without a Message-ID is told apart by what it says.
    const messageId = (
      email.messageId?.trim() ||
      `no-id:${createHash('sha256').update(`${from}\n${to}\n${subject}\n${body}`).digest('hex')}`
    ).slice(0, MAX_KEPT_LINE);

    return this.store.keepInboundEmail({
      messageId,
      fromAddress: from,
      toAddress: to,
      subject,
      body,
      spamScore:
        typeof email.spamScore === 'number' && Number.isFinite(email.spamScore)
          ? email.spamScore
          : null,
      attachmentCount: Math.max(0, Math.trunc(email.attachmentCount ?? 0)),
      automated: isAutomatedMail(email),
    });
  }

  /** Deletes the emails kept for longer than the days they are kept. */
  async deleteOld(afterDays = 30): Promise<number> {
    return this.store.deleteInboundEmailsBefore(
      new Date(Date.now() - afterDays * DAY_MS),
    );
  }
}
