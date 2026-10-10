import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { HelpdeskStore } from './helpdesk.store.js';
import {
  REQUESTER_NOTIFIER,
  type RequesterNotifier,
  TEAM_CHANNEL,
  type TeamChannel,
} from './helpdesk-host.contracts.js';
import {
  cutQuotedText,
  type InboundEmail,
  isAutomatedMail,
} from './helpdesk-inbound.js';
import { HelpdeskReplyAddress } from './helpdesk-reply-address.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// What is kept of the text of an email; a message of a ticket is shorter.
const MAX_KEPT_TEXT = 20_000;
const MAX_KEPT_LINE = 500;
// As long as a message of a ticket can be.
const MAX_MESSAGE = 5000;
// From this spam score on, the mail provider's filter calls it junk.
const SPAM_SCORE = 6;
// This many emails in an hour that matched no ticket is worth a look.
const UNMATCHED_ALERT = 10;
const HOUR_MS = 60 * 60 * 1000;
// An email not looked at after this long is stuck.
const STUCK_AFTER_MS = 15 * 60 * 1000;

// Email that arrives at the reply addresses of the Help Desk. Each email is
// kept once, for 30 days, and becomes a message of its ticket when its
// address and its sender say it is the requester answering. Anything else
// creates nothing.
@Injectable()
export class HelpdeskInboundService {
  private readonly logger = new Logger(HelpdeskInboundService.name);

  constructor(
    @Inject(HelpdeskStore) private readonly store: HelpdeskStore,
    @Inject(HelpdeskReplyAddress)
    private readonly replyAddress: HelpdeskReplyAddress,
    @Inject(HelpdeskTicketsService)
    private readonly tickets: HelpdeskTicketsService,
    @Inject(REQUESTER_NOTIFIER) private readonly notifier: RequesterNotifier,
    @Inject(TEAM_CHANNEL) private readonly teamChannel: TeamChannel,
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

    const kept = await this.store.keepInboundEmail({
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
    if (kept.kept) {
      // Keeping it is what must not fail; looking at it is tried again by
      // the scheduled job when it fails here.
      await this.process(kept.id).catch((err: unknown) =>
        this.logger.warn(
          `Email ${kept.id} kept and not processed: ${err instanceof Error ? err.message : 'unknown error'}`,
        ),
      );
    }
    return kept;
  }

  /**
   * Decides what a kept email is, and acts on it once. An email that already
   * has an outcome is left alone, so this is safe to run again.
   */
  async process(id: string): Promise<void> {
    const email = await this.store.findInboundEmail(id);
    if (email?.outcome !== 'RECEIVED') return;

    // A machine, or junk: nothing is created and nothing is sent back.
    if (email.automated) {
      await this.store.decideInboundEmail(id, 'AUTOMATED');
      return;
    }
    if (email.spamScore !== null && email.spamScore >= SPAM_SCORE) {
      await this.store.decideInboundEmail(id, 'SPAM');
      return;
    }

    // The address must be the one of a ticket, signed for that ticket. An
    // unknown number and a wrong signature are not told apart.
    const written = this.replyAddress.referenceIn(email.toAddress);
    const ticket = written
      ? await this.store.findTicketByReference(written.reference)
      : null;
    if (
      !written ||
      !ticket ||
      !this.replyAddress.signed(ticket.id, written.signature)
    ) {
      if (await this.store.decideInboundEmail(id, 'NO_TICKET')) {
        await this.tellSender(id, email.fromAddress);
      }
      return;
    }
    if (email.fromAddress !== ticket.email.trim().toLowerCase()) {
      if (
        await this.store.decideInboundEmail(id, 'SENDER_MISMATCH', ticket.id)
      ) {
        await this.tellSender(id, email.fromAddress);
      }
      return;
    }

    const text = cutQuotedText(email.body).slice(0, MAX_MESSAGE).trim();
    if (!text) {
      await this.store.decideInboundEmail(id, 'EMPTY', ticket.id);
      return;
    }

    // Claimed before the message is written, so that two runs write one.
    if (!(await this.store.decideInboundEmail(id, 'MATCHED', ticket.id)))
      return;
    try {
      const holder = await this.tickets.replyByEmail(ticket.id, text);
      if (holder && email.attachmentCount > 0) {
        // A key the agent's screen writes in its own language.
        await this.tickets.addSystemNote(
          holder,
          `inbound.attachments:${email.attachmentCount}`,
        );
      }
    } catch (err: unknown) {
      await this.store.undoInboundMatch(id);
      throw err;
    }
  }

  /**
   * Tells the team when email in needs a look: many emails of the last hour
   * matched no ticket, or some were kept and never looked at. Mail from
   * machines and spam are expected and not counted. Says whether it told.
   */
  async alertOnTrouble(): Promise<boolean> {
    const now = Date.now();
    const [outcomes, stuck] = await Promise.all([
      this.store.inboundOutcomesSince(new Date(now - HOUR_MS)),
      this.store.inboundStuckBefore(new Date(now - STUCK_AFTER_MS)),
    ]);
    const noTicket = outcomes.NO_TICKET ?? 0;
    const senderMismatch = outcomes.SENDER_MISMATCH ?? 0;
    if (noTicket + senderMismatch < UNMATCHED_ALERT && stuck === 0) {
      return false;
    }
    await this.teamChannel.emailInTrouble({ noTicket, senderMismatch, stuck });
    return true;
  }

  /** Looks at the kept emails that were not looked at when they arrived. */
  async processPending(limit = 100): Promise<number> {
    const pending = await this.store.pendingInboundEmails(limit);
    let processed = 0;
    for (const { id } of pending) {
      try {
        await this.process(id);
        processed += 1;
      } catch (err: unknown) {
        this.logger.warn(
          `Email ${id} not processed: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }
    return processed;
  }

  // Tells a sender, at most once a day, that their email matched no request.
  // A failure to tell them changes nothing else.
  private async tellSender(id: string, address: string): Promise<void> {
    const now = new Date();
    try {
      if (
        await this.store.senderToldSince(
          address,
          new Date(now.getTime() - DAY_MS),
        )
      ) {
        return;
      }
      await this.store.markSenderTold(id, now);
      await this.notifier.unmatchedSender(address);
    } catch (err: unknown) {
      this.logger.warn(
        `Sender of email ${id} not told: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  /** Deletes the emails kept for longer than the days they are kept. */
  async deleteOld(afterDays = 30): Promise<number> {
    return this.store.deleteInboundEmailsBefore(
      new Date(Date.now() - afterDays * DAY_MS),
    );
  }
}
