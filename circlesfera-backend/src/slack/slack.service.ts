import type {
  ModerationReportFiledEvent,
  PaymentAlertEvent,
  SupportTicketCreatedEvent,
} from '@circlesfera/shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { type Report, ReportStatus } from '@prisma/client';
import axios from 'axios';
import { ReviewReportUseCase } from '../admin/use-cases/content/commands/review-report.use-case.js';
import { AIService } from '../ai/ai.service.js';
import { redactSensitiveText } from '../common/observability/redaction.util.js';
import { sanitizeUrl } from '../common/utils/url-sanitizer.util.js';
import { EmailService } from '../email/email.service.js';
import { HelpdeskDataPort } from '../helpdesk/helpdesk-data.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackStaff } from './slack-staff.js';

// What each report button decides, as in the Admin Panel: dismiss the report,
// an upheld violation (the strike ladder turns it into a warning, a strike, a
// suspension or a ban), or a ban of the Profile for a severe case. The
// buttons of older alerts (ignore, ban) keep working the same way; their
// delete button now only points to the panel.
type SlackDecision = 'DISMISS' | 'STRIKE' | 'BAN';
const SLACK_DECISIONS: Record<string, SlackDecision> = {
  moderate_dismiss: 'DISMISS',
  moderate_ignore: 'DISMISS',
  moderate_strike: 'STRIKE',
  moderate_ban: 'BAN',
};

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  private readonly slackBotToken: string | undefined;

  private readonly defaultWebhookUrl: string | undefined;
  private readonly alertsWebhookUrl: string | undefined;
  private readonly moderationWebhookUrl: string | undefined;
  private readonly paymentsWebhookUrl: string | undefined;
  private readonly supportWebhookUrl: string | undefined;

  // Set by the container. The Help Desk tells this channel about tickets,
  // and this channel answers through the Help Desk.
  @Optional()
  @Inject(HelpdeskDataPort)
  private readonly helpdeskData?: HelpdeskDataPort;

  constructor(
    private prisma: PrismaService,
    // Kept in the signature for the container; support answers now go
    // through the Help Desk.
    _emailService: EmailService,
    private aiService: AIService,
    private configService: ConfigService,
    private slackStaff: SlackStaff,
    private moduleRef: ModuleRef,
  ) {
    this.slackBotToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    this.defaultWebhookUrl =
      this.configService.get<string>('SLACK_WEBHOOK_URL');
    this.alertsWebhookUrl =
      this.configService.get<string>('SLACK_WEBHOOK_ALERTS') ||
      this.defaultWebhookUrl;
    this.moderationWebhookUrl =
      this.configService.get<string>('SLACK_WEBHOOK_MODERATION') ||
      this.defaultWebhookUrl;
    this.paymentsWebhookUrl =
      this.configService.get<string>('SLACK_WEBHOOK_PAYMENTS') ||
      this.defaultWebhookUrl;
    this.supportWebhookUrl =
      this.configService.get<string>('SLACK_WEBHOOK_SUPPORT') ||
      this.defaultWebhookUrl;
  }

  // Every Slack notification (incidents, moderation, payments, support)
  // funnels through here. Previously a single failed POST was logged and
  // dropped with no retry -- for handleSystemIncident specifically, that
  // meant an infra problem severe enough to take Slack down with it (a
  // plausible correlated failure) silently lost the one alert meant to tell
  // a human about it. Retries with backoff; if every attempt
  // fails, logs a distinctive high-severity marker so ops has a trace to
  // grep for even without Slack.
  private static readonly SEND_MAX_ATTEMPTS = 3;
  private static readonly SEND_BACKOFF_MS = 300;

  private async sendMessage(
    webhookUrl: string | undefined,
    payload: any,
  ): Promise<void> {
    if (!webhookUrl) {
      this.logger.warn(
        'No Slack Webhook URL configured. Skipping Slack notification.',
      );
      return;
    }

    for (
      let attempt = 1;
      attempt <= SlackService.SEND_MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        await axios.post(webhookUrl, payload, { timeout: 5_000 });
        return;
      } catch (error) {
        // A malformed payload (400) or a deleted/invalid webhook URL (404)
        // will fail identically on retry -- only network errors, 429, and
        // 5xx are worth retrying (same transient/permanent split as the
        // rest of the retry policy).
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        const retryable =
          status === undefined || status === 429 || status >= 500;

        if (!retryable || attempt === SlackService.SEND_MAX_ATTEMPTS) {
          this.logger.error(
            `SLACK_DELIVERY_FAILED after ${attempt} attempt(s) -- notification lost`,
            error,
          );
          return;
        }
        this.logger.warn(
          `Slack message delivery failed (attempt ${attempt}/${SlackService.SEND_MAX_ATTEMPTS}), retrying`,
          error,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, SlackService.SEND_BACKOFF_MS * attempt),
        );
      }
    }
  }

  @OnEvent('system.incident', { async: true })
  async handleSystemIncident(event: {
    message: string;
    stack?: string;
    path?: string;
    correlationId?: string;
  }): Promise<void> {
    await this.sendProductionAlert(event);
  }

  async sendProductionAlert(errorInfo: {
    message: string;
    stack?: string;
    path?: string;
    correlationId?: string;
  }): Promise<void> {
    const sanitizedPath = errorInfo.path
      ? sanitizeUrl(errorInfo.path)
      : 'Unknown';
    const sanitizedMessage = redactSensitiveText(errorInfo.message);
    const sanitizedStack = errorInfo.stack
      ? redactSensitiveText(errorInfo.stack).substring(0, 2000)
      : undefined;

    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 Production Error 🚨' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Path:*\n${sanitizedPath}` },
            { type: 'mrkdwn', text: `*Message:*\n${sanitizedMessage}` },
            ...(errorInfo.correlationId
              ? [
                  {
                    type: 'mrkdwn',
                    text: `*Correlation ID:*\n\`${errorInfo.correlationId}\``,
                  },
                ]
              : []),
          ],
        },
        ...(sanitizedStack
          ? [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Stacktrace:*\n\`\`\`${sanitizedStack}\`\`\``,
                },
              },
            ]
          : []),
      ],
    };
    await this.sendMessage(this.alertsWebhookUrl, payload);
  }

  @OnEvent('moderation.report_filed', { async: true })
  async sendModerationAlert(
    reportInfo: ModerationReportFiledEvent['payload'],
  ): Promise<void> {
    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🛡️ New Moderation Report' },
        },
        {
          type: 'section',
          // Identifiers and the reason only: who reported and what they wrote
          // are read in the Admin Panel, not posted to Slack.
          fields: [
            {
              type: 'mrkdwn',
              text: `*Target Type:*\n${reportInfo.targetType}`,
            },
            { type: 'mrkdwn', text: `*Target ID:*\n${reportInfo.targetId}` },
            { type: 'mrkdwn', text: `*Reason:*\n${reportInfo.reason}` },
            {
              type: 'mrkdwn',
              text: `*Report ID:*\n\`${reportInfo.reportId}\``,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${this.reportsPanelUrl()}|Abrir en el panel de staff>`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Desestimar',
                emoji: true,
              },
              style: 'primary',
              value: `dismiss_${reportInfo.reportId}`,
              action_id: 'moderate_dismiss',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '⚠️ Infracción',
                emoji: true,
              },
              style: 'danger',
              value: `strike_${reportInfo.reportId}`,
              action_id: 'moderate_strike',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '⛔ Banear perfil',
                emoji: true,
              },
              style: 'danger',
              value: `ban_${reportInfo.reportId}`,
              action_id: 'moderate_ban',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🤖 Analizar con IA',
                emoji: true,
              },
              value: `ai_${reportInfo.reportId}`,
              action_id: 'moderate_ai',
            },
          ],
        },
      ],
    };
    await this.sendMessage(this.moderationWebhookUrl, payload);
  }

  @OnEvent('payment.alert', { async: true })
  async sendPaymentAlert(
    paymentInfo: PaymentAlertEvent['payload'],
  ): Promise<void> {
    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '💰 Payment Activity' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Event:*\n${paymentInfo.eventType}` },
            ...(paymentInfo.amount
              ? [
                  {
                    type: 'mrkdwn',
                    text: `*Amount:*\n${(paymentInfo.amount / 100).toFixed(2)} ${paymentInfo.currency?.toUpperCase() || 'USD'}`,
                  },
                ]
              : []),
            ...(paymentInfo.userId
              ? [{ type: 'mrkdwn', text: `*User ID:*\n${paymentInfo.userId}` }]
              : []),
            ...(paymentInfo.description
              ? [
                  {
                    type: 'mrkdwn',
                    text: `*Description:*\n${paymentInfo.description}`,
                  },
                ]
              : []),
          ],
        },
      ],
    };
    await this.sendMessage(this.paymentsWebhookUrl, payload);
  }

  @OnEvent('support.ticket_created', { async: true })
  async sendSupportAlert(
    ticket: SupportTicketCreatedEvent['payload'],
  ): Promise<void> {
    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎟️ Nuevo Ticket de Soporte' },
        },
        {
          type: 'section',
          // The number only: who wrote and what they wrote are read in the
          // Help Desk, not posted to Slack.
          fields: [{ type: 'mrkdwn', text: `*ID:*\n\`${ticket.id}\`` }],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✍️ Responder', emoji: true },
              style: 'primary',
              value: ticket.id,
              action_id: 'support_reply',
            },
          ],
        },
      ],
    };
    await this.sendMessage(this.supportWebhookUrl, payload);
  }

  // A requester answered in their ticket: the team hears of it. Only the
  // number; the conversation is read in the Help Desk.
  async sendSupportReplyAlert(ticket: {
    id: string;
    reference: number;
    subject: string;
  }): Promise<void> {
    await this.sendMessage(this.supportWebhookUrl, {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '💬 Respuesta en un ticket' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Ticket:*\n#${ticket.reference}` },
            { type: 'mrkdwn', text: `*ID:*\n\`${ticket.id}\`` },
          ],
        },
      ],
    });
  }

  // Email that answers support requests needs a look. Counts only: no
  // address, subject or text of anyone's email.
  async sendSupportEmailInAlert(trouble: {
    noTicket: number;
    senderMismatch: number;
    stuck: number;
  }): Promise<void> {
    await this.sendMessage(this.supportWebhookUrl, {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📭 Correo de soporte: revisar',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Sin solicitud (última hora):*\n${trouble.noTicket}`,
            },
            {
              type: 'mrkdwn',
              text: `*De otro remitente (última hora):*\n${trouble.senderMismatch}`,
            },
            {
              type: 'mrkdwn',
              text: `*Sin procesar tras 15 min:*\n${trouble.stuck}`,
            },
          ],
        },
      ],
    });
  }

  // Phase 2: Slash Commands
  async handleStatsCommand(slackUserId: unknown): Promise<any> {
    if (!(await this.slackStaff.staffFor(slackUserId, 'users.read'))) {
      return this.notStaffAnswer();
    }
    try {
      const totalUsers = await this.prisma.user.count({
        where: { isActive: true },
      });
      const bannedUsers = await this.prisma.user.count({
        where: { isActive: false },
      });
      const totalPosts24h = await this.prisma.post.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      const pendingReports = await this.prisma.report.count({
        where: { status: 'PENDING' },
      });

      return {
        response_type: 'in_channel',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📊 CircleSfera Metrics Dashboard',
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*👥 Active Users:*\n${totalUsers}` },
              { type: 'mrkdwn', text: `*🚫 Banned Users:*\n${bannedUsers}` },
              { type: 'mrkdwn', text: `*📝 Posts (24h):*\n${totalPosts24h}` },
              {
                type: 'mrkdwn',
                text: `*🚨 Pending Reports:*\n${pendingReports}`,
              },
            ],
          },
        ],
      };
    } catch (error) {
      this.logger.error('Error in handleStatsCommand', error);
      return { text: '❌ Error fetching stats from database.' };
    }
  }

  async handleUserCommand(text: string, slackUserId: unknown): Promise<any> {
    if (!(await this.slackStaff.staffFor(slackUserId, 'users.read'))) {
      return this.notStaffAnswer();
    }
    if (!text || text.trim() === '') {
      return {
        text: '⚠️ Por favor, proporciona un email o username (ej. `/cs-user shading`).',
      };
    }

    const searchTerm = text.trim();
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: searchTerm },
            { profiles: { some: { username: searchTerm } } },
          ],
        },
        include: { profiles: true },
      });

      if (!user) {
        return {
          text: `❌ No se ha encontrado ningún usuario con: \`${searchTerm}\``,
        };
      }

      // Only to whoever asked, and no email, bio or post: the details of a
      // person are read in the Admin Panel.
      return {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🔍 Información de Usuario: @${user.profiles[0]?.username || 'Desconocido'}`,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*ID:*\n\`${user.id}\`` },
              {
                type: 'mrkdwn',
                text: `*Estado:*\n${user.isActive ? '✅ Activo' : '🚫 Baneado/Inactivo'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Verificado:*\n${user.profiles?.[0]?.verificationLevel || 'BASIC'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Registro:*\n${user.createdAt.toISOString().split('T')[0]}`,
              },
              { type: 'mrkdwn', text: `*Role:*\n${user.role}` },
            ],
          },
        ],
      };
    } catch (error) {
      this.logger.error('Error in handleUserCommand', error);
      return { text: '❌ Error al buscar el usuario en la base de datos.' };
    }
  }

  // Runs every day at 08:00 AM UTC via BullMQ
  async sendDailyMorningBriefing(): Promise<void> {
    if (!this.alertsWebhookUrl) return;

    this.logger.log('Executing Daily Morning Briefing Cron Job...');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const newUsers = await this.prisma.user.count({
        where: { createdAt: { gte: yesterday } },
      });
      const newPosts = await this.prisma.post.count({
        where: { createdAt: { gte: yesterday } },
      });
      const pendingReports = await this.prisma.report.count({
        where: { status: 'PENDING' },
      });
      const newPlatformSubscriptions =
        await this.prisma.platformSubscription.count({
          where: { createdAt: { gte: yesterday } },
        });
      const newSubscriptions = newPlatformSubscriptions;

      const metrics = { newUsers, newPosts, pendingReports, newSubscriptions };
      const aiSummary = await this.aiService.generateMorningBriefing(metrics);

      const payload = {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🌅 Morning Briefing (AI)' },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: aiSummary },
          },
        ],
      };

      await this.sendMessage(this.alertsWebhookUrl, payload);
    } catch (error) {
      this.logger.error('Error executing Morning Briefing Cron', error);
    }
  }

  private reportsPanelUrl(): string {
    const base =
      this.configService.get<string>('ADMIN_BASE_URL') ||
      'https://admin.circlesfera.com';
    return `${base.replace(/\/$/, '')}/reports`;
  }

  // Only to whoever asked: nothing was done or read for them.
  private notStaffAnswer() {
    return {
      response_type: 'ephemeral',
      text: '⚠️ No se ha hecho nada: tu cuenta de Slack no corresponde a ningún miembro del staff con permiso para esto.',
    };
  }

  private notAllowedText(): string {
    return `⚠️ No se ha hecho nada: tu cuenta de Slack no corresponde a ningún miembro del staff con permiso de denuncias. Decide en el panel: ${this.reportsPanelUrl()}`;
  }

  // Decides a report as the member of staff who pressed the button, through
  // the same use case as the Admin Panel: the person gets the notice, the
  // statement of reasons and the appeal, and the audit log names who acted.
  // Nothing is done, and null is answered, when the Slack account is no
  // member of staff who may decide reports.
  private async decideReport(
    slackUserId: unknown,
    report: Report,
    decision: SlackDecision,
    who: string,
  ): Promise<string | null> {
    const adminId = await this.slackStaff.moderatorFor(slackUserId);
    if (!adminId) return null;
    if (
      report.status === ReportStatus.RESOLVED ||
      report.status === ReportStatus.REJECTED
    ) {
      return `ℹ️ Esta denuncia ya estaba decidida (${report.status}).`;
    }
    const reviews = this.moduleRef.get(ReviewReportUseCase, { strict: false });
    if (decision === 'DISMISS') {
      await reviews.updateStatus(adminId, report.id, ReportStatus.REJECTED);
      return `✅ Denuncia desestimada por @${who}`;
    }
    await reviews.resolveWithPenalty(adminId, report.id, decision);
    return decision === 'BAN'
      ? `⛔ Perfil baneado por @${who}`
      : `⚠️ Infracción aplicada por @${who}`;
  }

  // The reply button of a support alert opens a form to answer the ticket,
  // for a member of staff with the support permission.
  private async openSupportReply(payload: any, ticketId: string): Promise<any> {
    if (!(await this.slackStaff.staffFor(payload.user?.id, 'support'))) {
      return this.notStaffAnswer();
    }
    const triggerId = payload.trigger_id;

    if (!this.slackBotToken) {
      this.logger.error('SLACK_BOT_TOKEN not configured. Cannot open modal.');
      return { text: 'Bot token missing. Check server config.' };
    }

    try {
      await axios.post(
        'https://slack.com/api/views.open',
        {
          trigger_id: triggerId,
          view: {
            type: 'modal',
            callback_id: `support_reply_modal_${ticketId}`,
            title: { type: 'plain_text', text: 'Responder Ticket' },
            submit: { type: 'plain_text', text: 'Enviar Respuesta' },
            close: { type: 'plain_text', text: 'Cancelar' },
            blocks: [
              {
                type: 'input',
                block_id: 'reply_input_block',
                element: {
                  type: 'plain_text_input',
                  action_id: 'reply_text',
                  multiline: true,
                },
                label: { type: 'plain_text', text: 'Tu Respuesta' },
              },
            ],
          },
        },
        {
          headers: { Authorization: `Bearer ${this.slackBotToken}` },
          timeout: 5_000,
        },
      );
    } catch (error) {
      this.logger.error('Failed to open slack modal', error);
    }
    return; // Empty response for modal opening
  }

  // Phase 2: Interactive Moderation
  // Slack is answered as soon as a button is pressed, so what the handler
  // answers never reaches it: unless the message itself shows the outcome,
  // who pressed is told, in a message only they see.
  async handleModerationInteraction(payload: any): Promise<any> {
    const answer = await this.handleButton(payload);
    if (answer?.text && !answer.shown) {
      await this.tellWhoPressed(payload, answer.text);
    }
    return answer;
  }

  private async tellWhoPressed(payload: any, text: string): Promise<void> {
    if (!this.slackBotToken || !payload.channel?.id || !payload.user?.id) {
      return;
    }
    try {
      // The Web API at a fixed address; channel and user go in the body.
      await axios.post(
        'https://slack.com/api/chat.postEphemeral',
        {
          channel: payload.channel.id as string,
          user: payload.user.id as string,
          text,
        },
        {
          headers: { Authorization: `Bearer ${this.slackBotToken}` },
          timeout: 5_000,
        },
      );
    } catch (error) {
      this.logger.warn('Could not tell who pressed a Slack button', error);
    }
  }

  private async handleButton(payload: any): Promise<any> {
    const action = payload.actions?.[0];
    const userWhoClicked = payload.user?.username || 'Admin';

    if (!action) return;

    const actionId = action.action_id;
    const value = action.value; // E.g. ignore_123, delete_123, ban_123
    // Its value is the ticket's id, not a report's.
    if (actionId === 'support_reply') {
      return this.openSupportReply(payload, value);
    }
    const reportId = value.split('_').slice(1).join('_');

    if (!reportId) {
      this.logger.error('No reportId found in interaction payload');
      return { text: 'ℹ️ Este aviso no corresponde a ninguna denuncia.' };
    }

    try {
      const report = await this.prisma.report.findUnique({
        where: { id: reportId },
      });
      if (!report) {
        // An alert of a test, or of a report erased since.
        return {
          text: 'ℹ️ Esta denuncia ya no existe: no hay nada que decidir. Puede ser el aviso de una prueba.',
        };
      }

      let resultText: string | null = '';

      if (actionId === 'moderate_delete') {
        // The delete button of older alerts removed content with no notice
        // or reasons. Content is removed in the panel.
        return {
          text: `⚠️ El contenido se retira desde el panel de staff: ${this.reportsPanelUrl()}`,
        };
      }

      const decision = SLACK_DECISIONS[actionId];
      if (decision !== undefined) {
        resultText = await this.decideReport(
          payload.user?.id,
          report,
          decision,
          userWhoClicked,
        );
        if (resultText === null) {
          // Nothing was done: the message keeps its buttons.
          return { text: this.notAllowedText() };
        }
      } else if (actionId === 'moderate_ai') {
        if (!(await this.slackStaff.moderatorFor(payload.user?.id))) {
          return { text: this.notAllowedText() };
        }
        let contentToAnalyze = '';
        if (report.targetType === 'POST') {
          const post = await this.prisma.post.findUnique({
            where: { id: report.targetId },
          });
          contentToAnalyze = post?.caption || '';
        } else if (report.targetType === 'COMMENT') {
          const comment = await this.prisma.comment.findUnique({
            where: { id: report.targetId },
          });
          contentToAnalyze = comment?.content || '';
        }

        if (!contentToAnalyze) {
          resultText = `🤖 AI Analysis: El contenido ya no está disponible o está vacío.`;
        } else {
          // Fallback to OpenAI Moderation endpoint or ChatGPT chat
          const modResult =
            await this.aiService.moderateContent(contentToAnalyze);
          if (modResult.flagged) {
            const flags = Object.keys(modResult.categories)
              .filter((k) => modResult.categories[k])
              .join(', ');
            resultText = `🤖 *AI Analysis (FLAGGED):* Contenido detectado como inapropiado por OpenAI. Categorías: ${flags}.`;
          } else {
            resultText = `🤖 *AI Analysis (SAFE):* OpenAI no ha detectado contenido explícito o inapropiado.`;
          }
        }

        // No cerramos el reporte, solo mostramos el veredicto
      }

      // We should return an update to the original message to remove the buttons and add the resolution text
      const blocks = payload.message?.blocks || [];
      // Remove the actions block (usually the last one)
      const updatedBlocks = blocks.filter((b: any) => b.type !== 'actions');
      updatedBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Status:* ${resultText}`,
        },
      });

      // Update the original Slack message using the Web API (hardcoded URL) instead of
      // response_url. This permanently eliminates the SSRF taint path: no user-supplied
      // value ever reaches the URL argument of axios (CodeQL js/ssrf mitigation).
      // channel and message.ts come from the payload but are sent as JSON body fields,
      // not as part of the URL.
      if (this.slackBotToken && payload.channel?.id && payload.message?.ts) {
        await axios.post(
          'https://slack.com/api/chat.update',
          {
            channel: payload.channel.id as string,
            ts: payload.message.ts as string,
            blocks: updatedBlocks,
          },
          {
            headers: { Authorization: `Bearer ${this.slackBotToken}` },
            timeout: 5_000,
          },
        );
      }

      // The message now shows the outcome.
      return { text: resultText, shown: true };
    } catch (error) {
      this.logger.error('Error handling moderation interaction', error);
      return { text: '❌ Error executing moderation action' };
    }
  }

  // Phase 3: Modal Submission
  async handleViewSubmission(payload: any): Promise<any> {
    try {
      const callbackId = payload.view?.callback_id;
      if (callbackId?.startsWith('support_reply_modal_')) {
        const ticketId = callbackId.replace('support_reply_modal_', '');
        // The answer goes out as the member of staff who wrote it.
        const agentRef = await this.slackStaff.staffFor(
          payload.user?.id,
          'support',
        );
        if (!agentRef) {
          return {
            response_action: 'errors',
            errors: {
              reply_input_block:
                'Tu cuenta de Slack no corresponde a ningún miembro del staff con permiso de soporte.',
            },
          };
        }
        const stateValues = payload.view.state.values;
        const replyText = stateValues.reply_input_block.reply_text.value;

        // The Help Desk adds the answer to the conversation, solves the
        // ticket and tells the requester. It refuses a ticket that is
        // already solved, closed or with moderation.
        const answered = await this.helpdeskData?.answerFromTeamChannel(
          ticketId,
          replyText,
          agentRef,
        );
        if (answered) {
          this.logger.log(`Support ticket ${ticketId} resolved via Slack`);
        }
      }
      return { response_action: 'clear' };
    } catch (error) {
      this.logger.error('Error handling view submission', error);
      return { response_action: 'clear' };
    }
  }
}
