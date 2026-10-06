import { BrevoClient, BrevoError } from '@getbrevo/brevo';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { DEFAULT_LOCALE } from '../common/constants/locale.constants.js';
import { QUEUE_NAMES } from '../common/constants/queue-policy.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_COPY } from './email-copy.js';
import {
  type EmailContext,
  EmailTemplates,
  type RenderedEmail,
} from './email-templates.js';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

// Service for sending transactional emails (verification, password reset, welcome).
// Uses Brevo (formerly Sendinblue) API v3 via the official Node.js SDK (v5+).
// Public methods enqueue via BullMQ rather than calling Brevo inline:
// a synchronous call that only logged-and-swallowed on failure meant a Brevo
// outage silently and permanently lost a password-reset email (1h token) with
// no automatic recovery. deliverMail (called by EmailProcessor) does the
// actual send and throws on a transient failure so BullMQ retries it; a
// permanent (4xx, non-429) BrevoError should NOT be retried -- see
// EmailProcessor, which classifies via isTransientBrevoFailure below.
export const MAX_EMAILS_PER_RECIPIENT_WINDOW = 5;
export const RECIPIENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// A 4xx Brevo error (invalid recipient, malformed payload, bad API key) will
// never succeed on retry. 429 (rate limit) and 5xx/network errors are worth
// retrying. Exported so EmailProcessor can decide UnrecoverableError vs a
// normal throw without duplicating the classification.
export function isTransientBrevoFailure(error: unknown): boolean {
  if (!(error instanceof BrevoError)) {
    return true; // Network/timeout/unknown -- assume transient, worth retrying.
  }
  if (error.statusCode === undefined) {
    return true;
  }
  if (error.statusCode === 429) {
    return true;
  }
  return error.statusCode >= 500;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private brevo: BrevoClient | null = null;
  private readonly recipientSendTimestamps = new Map<string, number[]>();

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.EMAIL_PROCESSING)
    private readonly emailQueue: Queue<SendMailOptions>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (apiKey) {
      this.brevo = new BrevoClient({
        apiKey,
        timeoutInSeconds: 15,
        // A single SDK-level retry for a quick network blip; BullMQ's
        // 4-attempt exponential backoff (see queue-policy.constants.ts)
        // handles the broader retry window -- no need to compound both.
        maxRetries: 1,
      });
    } else {
      this.logger.warn(
        'BREVO_API_KEY is not configured. Email sending will be skipped.',
      );
    }
  }

  private frontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    );
  }

  // The language of the account that owns the address; the default for an
  // address with no account (for example a waitlist entry).
  private async contextFor(email: string): Promise<EmailContext> {
    const user = await this.prisma.user
      .findUnique({ where: { email }, select: { locale: true } })
      .catch(() => null);
    return {
      locale: user?.locale ?? DEFAULT_LOCALE,
      frontendUrl: this.frontendUrl(),
    };
  }

  private async send(to: string, email: RenderedEmail): Promise<void> {
    await this.queueMail({ to, subject: email.subject, html: email.html });
  }

  private nameOr(ctx: EmailContext, name: string | null | undefined): string {
    return name?.trim() || EMAIL_COPY[ctx.locale].fallbackName;
  }

  // Welcome email for someone who joined the waitlist.
  async sendWelcomeEmail(email: string, name?: string | null) {
    const ctx = await this.contextFor(email);
    await this.send(email, EmailTemplates.welcome(ctx, this.nameOr(ctx, name)));
  }

  // Email verification link for a newly registered account.
  async sendVerificationEmail(email: string, token: string) {
    const ctx = await this.contextFor(email);
    const url = `${ctx.frontendUrl}/verify-email?token=${token}`;

    if (this.configService.get('NODE_ENV') !== 'production') {
      this.logger.debug(`[DEV ONLY] Verification link for ${email}: ${url}`);
    }

    await this.send(email, EmailTemplates.verification(ctx, url));
  }

  // Password-reset link (the token expires in 1 hour).
  async sendPasswordResetEmail(email: string, token: string) {
    const ctx = await this.contextFor(email);
    const url = `${ctx.frontendUrl}/reset-password?token=${token}`;
    await this.send(email, EmailTemplates.passwordReset(ctx, url));
  }

  // Staff-written broadcast; the content may contain basic HTML.
  async sendBroadcastEmail(
    email: string,
    subject: string,
    title: string,
    content: string,
    buttonText?: string,
    buttonUrl?: string,
  ) {
    const ctx = await this.contextFor(email);
    await this.send(
      email,
      EmailTemplates.broadcast(
        ctx,
        subject,
        title,
        content,
        buttonText,
        buttonUrl,
      ),
    );
  }

  // The account was suspended by staff.
  async sendAccountBannedEmail(email: string, name?: string | null) {
    const ctx = await this.contextFor(email);
    await this.send(
      email,
      EmailTemplates.accountBanned(ctx, this.nameOr(ctx, name)),
    );
  }

  // Staff removed one of the account's posts.
  async sendPostRemovedEmail(
    email: string,
    name: string | null | undefined,
    reason?: string,
  ) {
    const ctx = await this.contextFor(email);
    await this.send(
      email,
      EmailTemplates.postRemoved(ctx, this.nameOr(ctx, name), reason),
    );
  }

  // Outcome of an appeal, with the staff notes when there are any.
  async sendAppealDecisionEmail(
    email: string,
    name: string | null | undefined,
    approved: boolean,
    notes?: string,
  ) {
    const ctx = await this.contextFor(email);
    await this.send(
      email,
      EmailTemplates.appealDecision(
        ctx,
        this.nameOr(ctx, name),
        approved,
        notes,
      ),
    );
  }

  // The requested data export can be downloaded.
  async sendDataExportReadyEmail(
    email: string,
    name: string | null | undefined,
    url: string,
  ) {
    const ctx = await this.contextFor(email);
    await this.send(
      email,
      EmailTemplates.dataExportReady(ctx, this.nameOr(ctx, name), url),
    );
  }

  // Staff reply to a support request.
  async sendSupportReplyEmail(
    email: string,
    originalSubject: string,
    replyText: string,
  ) {
    const ctx = await this.contextFor(email);
    await this.send(
      email,
      EmailTemplates.supportReply(ctx, originalSubject, replyText),
    );
  }

  // Receipt for a platform subscription.
  async sendSubscriptionReceipt(
    email: string,
    planName: string,
    amount: string,
  ) {
    const ctx = await this.contextFor(email);
    await this.send(
      email,
      EmailTemplates.subscriptionReceipt(ctx, planName, amount),
    );
  }

  // Enqueue an email for delivery. Returns as soon as the job is
  // queued -- callers never block on Brevo's actual response time, and a
  // transient Brevo failure gets BullMQ's retry/backoff instead of being
  // silently dropped. See deliverMail for the actual send.
  private async queueMail(options: SendMailOptions): Promise<void> {
    if (!this.brevo) {
      this.logger.warn(
        `Skipping email send to ${options.to}: BREVO_API_KEY not set.`,
      );
      return;
    }
    try {
      await this.emailQueue.add('send-transactional-email', options);
    } catch (error) {
      // Callers (e.g. AuthService) call this after their own DB mutation
      // (user created, reset token stored) -- a Redis/BullMQ enqueue failure
      // must not fail their HTTP response on top of that, same principle as
      // the old inline design. Logged, not retried: retrying the enqueue
      // itself (as opposed to the send, which BullMQ already retries once
      // queued) is not implemented here.
      this.logger.error(`Failed to queue email to ${options.to}`, error);
    }
  }

  // Performs the actual Brevo send. Called by EmailProcessor, not directly
  // by feature code -- use the sendXEmail methods above, which queue.
  // Throws on failure so the caller (EmailProcessor) can retry via BullMQ;
  // does NOT throw for a suppressed (quota-exceeded) send, since that isn't
  // a failure worth retrying.
  async deliverMail(options: SendMailOptions): Promise<void> {
    if (!this.brevo) {
      this.logger.warn(
        `Skipping email send to ${options.to}: BREVO_API_KEY not set.`,
      );
      return;
    }

    const normalizedTo = options.to.trim().toLowerCase();
    const now = Date.now();
    const timestamps = (
      this.recipientSendTimestamps.get(normalizedTo) || []
    ).filter((ts) => now - ts < RECIPIENT_WINDOW_MS);

    if (timestamps.length >= MAX_EMAILS_PER_RECIPIENT_WINDOW) {
      this.logger.warn(
        `Email quota exceeded for recipient ${normalizedTo} (${timestamps.length}/${MAX_EMAILS_PER_RECIPIENT_WINDOW} in ${RECIPIENT_WINDOW_MS / 60000}m). Suppressing email "${options.subject}".`,
      );
      return;
    }

    timestamps.push(now);
    this.recipientSendTimestamps.set(normalizedTo, timestamps);

    // Periodic map cleanup to bound memory footprint
    if (this.recipientSendTimestamps.size > 5000) {
      for (const [key, list] of this.recipientSendTimestamps.entries()) {
        const active = list.filter((ts) => now - ts < RECIPIENT_WINDOW_MS);
        if (active.length === 0) {
          this.recipientSendTimestamps.delete(key);
        } else {
          this.recipientSendTimestamps.set(key, active);
        }
      }
    }

    const fromEmail =
      this.configService.get<string>('EMAIL_FROM') || 'noreply@circlesfera.com';
    const fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') || 'CircleSfera';

    try {
      await this.brevo.transactionalEmails.sendTransacEmail({
        subject: options.subject,
        htmlContent: options.html,
        sender: { email: fromEmail, name: fromName },
        to: [{ email: options.to }],
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send email to ${options.to} (subject: "${options.subject}").`,
        error,
      );
      throw error;
    }
  }
}
