import { BrevoClient, BrevoError } from '@getbrevo/brevo';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../common/constants/queue-policy.constants.js';
import { EmailTemplates } from './email-templates.js';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

// Service for sending transactional emails (verification, password reset, welcome).
// Uses Brevo (formerly Sendinblue) API v3 via the official Node.js SDK (v5+).
// Public methods enqueue via BullMQ (INT-001) rather than calling Brevo inline:
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

  // Send a welcome email to a user who just joined the whitelist.
  // Param email: The recipient's email address
  // Param name: The recipient's name
  async sendWelcomeEmail(email: string, name: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    await this.queueMail({
      to: email,
      subject: '¡Bienvenido a CircleSfera!',
      html: EmailTemplates.welcome(name, frontendUrl),
    });
  }

  // Send an email verification link to a newly registered user.
  // Param email: The recipient's email address
  // Param token: The email verification token
  async sendVerificationEmail(email: string, token: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const url = `${frontendUrl}/verify-email?token=${token}`;

    if (this.configService.get('NODE_ENV') !== 'production') {
      this.logger.debug(`[DEV ONLY] Verification link for ${email}: ${url}`);
    }

    await this.queueMail({
      to: email,
      subject: 'Verifica tu cuenta en CircleSfera',
      html: EmailTemplates.verification(url),
    });
  }

  // Send a password-reset link to the user.
  // Param email: The recipient's email address
  // Param token: The password-reset token (expires in 1 hour)
  async sendPasswordResetEmail(email: string, token: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const url = `${frontendUrl}/reset-password?token=${token}`;

    await this.queueMail({
      to: email,
      subject: 'Recupera tu contraseña en CircleSfera',
      html: EmailTemplates.passwordReset(url),
    });
  }

  // Send a broadcast/newsletter email to a user.
  // Param email: The recipient's email address
  // Param subject: The email subject line
  // Param title: The main heading inside the email
  // Param content: The body text (can contain basic HTML)
  // Param buttonText: Optional button label
  // Param buttonUrl: Optional button link
  async sendBroadcastEmail(
    email: string,
    subject: string,
    title: string,
    content: string,
    buttonText?: string,
    buttonUrl?: string,
  ) {
    await this.queueMail({
      to: email,
      subject,
      html: EmailTemplates.broadcast(title, content, buttonText, buttonUrl),
    });
  }

  // Send a moderation notice to a user.
  async sendModerationEmail(
    email: string,
    userName: string,
    action: string,
    targetType: string,
    reason: string,
  ) {
    await this.queueMail({
      to: email,
      subject: 'Aviso de Moderación - CircleSfera',
      html: EmailTemplates.moderationAction(
        userName,
        action,
        targetType,
        reason,
      ),
    });
  }

  // Send a support ticket reply to a user.
  async sendSupportReplyEmail(
    email: string,
    originalSubject: string,
    replyText: string,
  ) {
    await this.queueMail({
      to: email,
      subject: `Re: ${originalSubject} - Soporte CircleSfera`,
      html: EmailTemplates.broadcast(
        'Respuesta a tu consulta',
        replyText.replace(/\n/g, '<br/>'),
      ),
    });
  }

  // Send a subscription receipt to a user.
  async sendSubscriptionReceipt(
    email: string,
    planName: string,
    amount: string,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    await this.queueMail({
      to: email,
      subject: `Recibo de Suscripción - ${planName}`,
      html: EmailTemplates.subscriptionReceipt(planName, amount, frontendUrl),
    });
  }

  // Enqueue an email for delivery (INT-001). Returns as soon as the job is
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
    await this.emailQueue.add('send-transactional-email', options);
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
