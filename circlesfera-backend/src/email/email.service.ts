import { BrevoClient } from '@getbrevo/brevo';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailTemplates } from './email-templates.js';

/**
 * Service for sending transactional emails (verification, password reset, welcome).
 * Uses Brevo (formerly Sendinblue) API v3 via the official Node.js SDK (v5+).
 * Silently skips failures in non-production environments.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly brevo?: BrevoClient;

  constructor(@Inject(ConfigService) private configService: ConfigService) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (apiKey) {
      this.brevo = new BrevoClient({ apiKey });
    } else {
      this.logger.warn(
        'BREVO_API_KEY is not configured. Email sending will be skipped.',
      );
    }
  }

  /**
   * Send a welcome email to a user who just joined the whitelist.
   * @param email - The recipient's email address
   * @param name - The recipient's name
   */
  async sendWelcomeEmail(email: string, name: string) {
    await this.sendMail({
      to: email,
      subject: '¡Bienvenido a CircleSfera!',
      html: EmailTemplates.welcome(name),
    });
  }

  /**
   * Send an email verification link to a newly registered user.
   * @param email - The recipient's email address
   * @param token - The email verification token
   */
  async sendVerificationEmail(email: string, token: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:8080';

    const url = `${frontendUrl}/verify-email?token=${token}`;

    await this.sendMail({
      to: email,
      subject: 'Verifica tu cuenta en CircleSfera',
      html: EmailTemplates.verification(url),
    });
  }

  /**
   * Send a password-reset link to the user.
   * @param email - The recipient's email address
   * @param token - The password-reset token (expires in 1 hour)
   */
  async sendPasswordResetEmail(email: string, token: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:8080';

    const url = `${frontendUrl}/reset-password?token=${token}`;

    await this.sendMail({
      to: email,
      subject: 'Recupera tu contraseña en CircleSfera',
      html: EmailTemplates.passwordReset(url),
    });
  }

  /**
   * Send a broadcast/newsletter email to a user.
   * @param email - The recipient's email address
   * @param subject - The email subject line
   * @param title - The main heading inside the email
   * @param content - The body text (can contain basic HTML)
   * @param buttonText - Optional button label
   * @param buttonUrl - Optional button link
   */
  async sendBroadcastEmail(
    email: string,
    subject: string,
    title: string,
    content: string,
    buttonText?: string,
    buttonUrl?: string,
  ) {
    await this.sendMail({
      to: email,
      subject,
      html: EmailTemplates.broadcast(title, content, buttonText, buttonUrl),
    });
  }

  /**
   * Send a moderation notice to a user.
   */
  async sendModerationEmail(
    email: string,
    userName: string,
    action: string,
    targetType: string,
    reason: string,
  ) {
    await this.sendMail({
      to: email,
      subject: 'Aviso de Moderación - CircleSfera',
      html: EmailTemplates.moderationAction(userName, action, targetType, reason),
    });
  }

  /**
   * Low-level method to send an email via Brevo API.
   * @param options - Email options
   */
  private async sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }) {
    if (!this.brevo) {
      this.logger.warn(
        `Skipping email send to ${options.to}: BREVO_API_KEY not set.`,
      );
      return;
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
      this.logger.error('Failed to send email via Brevo', error);

      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw error;
      }
    }
  }
}
