import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { SupportTicket } from '@prisma/client';
import axios from 'axios';
import { AIService } from '../ai/ai.service.js';
import { redactSensitiveText } from '../common/observability/redaction.util.js';
import { sanitizeUrl } from '../common/utils/url-sanitizer.util.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  private readonly slackBotToken: string | undefined;

  private readonly defaultWebhookUrl: string | undefined;
  private readonly alertsWebhookUrl: string | undefined;
  private readonly moderationWebhookUrl: string | undefined;
  private readonly paymentsWebhookUrl: string | undefined;
  private readonly supportWebhookUrl: string | undefined;

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private aiService: AIService,
    private configService: ConfigService,
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
  // a human about it. Retries with backoff (INT-001); if every attempt
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
        // rest of INT-001).
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
  async sendModerationAlert(reportInfo: {
    reportId: string;
    reporterId: string;
    targetType: string;
    targetId: string;
    reason: string;
    details?: string;
  }): Promise<void> {
    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🛡️ New Moderation Report' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Reporter:*\n${reportInfo.reporterId}` },
            {
              type: 'mrkdwn',
              text: `*Target Type:*\n${reportInfo.targetType}`,
            },
            { type: 'mrkdwn', text: `*Target ID:*\n${reportInfo.targetId}` },
            { type: 'mrkdwn', text: `*Reason:*\n${reportInfo.reason}` },
          ],
        },
        ...(reportInfo.details
          ? [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Details:*\n${reportInfo.details}`,
                },
              },
            ]
          : []),
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Ignorar',
                emoji: true,
              },
              style: 'primary',
              value: `ignore_${reportInfo.reportId}`,
              action_id: 'moderate_ignore',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🗑️ Borrar',
                emoji: true,
              },
              style: 'danger',
              value: `delete_${reportInfo.reportId}`,
              action_id: 'moderate_delete',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '☠️ Banear Usuario',
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
  async sendPaymentAlert(paymentInfo: {
    eventType: string;
    amount?: number;
    currency?: string;
    description?: string;
    userId?: string;
  }): Promise<void> {
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
  async sendSupportAlert(ticket: SupportTicket): Promise<void> {
    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎟️ Nuevo Ticket de Soporte' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Email:*\n${ticket.email}` },
            { type: 'mrkdwn', text: `*Asunto:*\n${ticket.subject}` },
            { type: 'mrkdwn', text: `*ID:*\n\`${ticket.id}\`` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Mensaje:*\n${ticket.message}` },
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

  // Phase 2: Slash Commands
  async handleStatsCommand(): Promise<any> {
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

  async handleUserCommand(text: string): Promise<any> {
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
        include: {
          profiles: {
            include: {
              posts: {
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
      });

      if (!user) {
        return {
          text: `❌ No se ha encontrado ningún usuario con: \`${searchTerm}\``,
        };
      }

      return {
        response_type: 'in_channel',
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
              { type: 'mrkdwn', text: `*Email:*\n${user.email}` },
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
          ...(user.profiles[0]?.bio
            ? [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*Bio:*\n_${user.profiles[0].bio}_`,
                  },
                },
              ]
            : []),
          ...(user.profiles[0]?.posts && user.profiles[0]?.posts.length > 0
            ? [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*Último Post:*\n${user.profiles[0]?.posts[0].caption || '(Sin texto)'}`,
                  },
                },
              ]
            : []),
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

  // Phase 2: Interactive Moderation
  async handleModerationInteraction(payload: any): Promise<any> {
    const action = payload.actions?.[0];
    const userWhoClicked = payload.user?.username || 'Admin';

    if (!action) return;

    const actionId = action.action_id;
    const value = action.value; // E.g. ignore_123, delete_123, ban_123
    const reportId = value.split('_').slice(1).join('_');

    if (!reportId) {
      this.logger.error('No reportId found in interaction payload');
      return { text: 'Invalid report ID' };
    }

    try {
      const report = await this.prisma.report.findUnique({
        where: { id: reportId },
      });
      if (!report) {
        return { text: 'Report not found' };
      }

      let resultText = '';

      if (actionId === 'moderate_ignore') {
        await this.prisma.report.update({
          where: { id: reportId },
          data: { status: 'RESOLVED' },
        });
        resultText = `✅ Report ignored by @${userWhoClicked}`;
      } else if (actionId === 'moderate_delete') {
        if (report.targetType === 'POST') {
          await this.prisma.post.update({
            where: { id: report.targetId },
            data: { moderationStatus: 'REMOVED' },
          });
          resultText = `🗑️ Post deleted by @${userWhoClicked}`;
        } else if (report.targetType === 'COMMENT') {
          await this.prisma.comment.update({
            where: { id: report.targetId },
            data: { moderationStatus: 'REMOVED' },
          });
          resultText = `🗑️ Comment deleted by @${userWhoClicked}`;
        } else {
          resultText = `⚠️ Cannot delete target type: ${report.targetType}`;
        }

        await this.prisma.report.update({
          where: { id: reportId },
          data: { status: 'RESOLVED' },
        });
      } else if (actionId === 'moderate_ban') {
        let reportedUserId = '';
        if (report.targetType === 'USER') {
          reportedUserId = report.targetId;
        } else if (report.targetType === 'POST') {
          const post = await this.prisma.post.findUnique({
            where: { id: report.targetId },
          });
          if (post) reportedUserId = post.profileId;
        } else if (report.targetType === 'COMMENT') {
          const comment = await this.prisma.comment.findUnique({
            where: { id: report.targetId },
          });
          if (comment) reportedUserId = comment.profileId;
        }

        if (reportedUserId) {
          await this.prisma.user.update({
            where: { id: reportedUserId },
            data: { isActive: false },
          });
          resultText = `☠️ User banned by @${userWhoClicked}`;

          await this.prisma.report.update({
            where: { id: reportId },
            data: { status: 'RESOLVED' },
          });
        } else {
          resultText = `⚠️ Could not find user to ban`;
        }
      } else if (actionId === 'moderate_ai') {
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
      } else if (actionId === 'support_reply') {
        const ticketId = value;
        const triggerId = payload.trigger_id;

        if (!this.slackBotToken) {
          this.logger.error(
            'SLACK_BOT_TOKEN not configured. Cannot open modal.',
          );
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

      return { text: resultText };
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
        const stateValues = payload.view.state.values;
        const replyText = stateValues.reply_input_block.reply_text.value;

        const ticket = await this.prisma.supportTicket.findUnique({
          where: { id: ticketId },
        });

        if (ticket && ticket.status !== 'RESOLVED') {
          // Send email via Brevo
          await this.emailService.sendSupportReplyEmail(
            ticket.email,
            ticket.subject,
            replyText,
          );

          // Update ticket status in DB
          await this.prisma.supportTicket.update({
            where: { id: ticketId },
            data: {
              status: 'RESOLVED',
              reply: replyText,
              resolvedAt: ticket.resolvedAt ?? new Date(),
            },
          });

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
