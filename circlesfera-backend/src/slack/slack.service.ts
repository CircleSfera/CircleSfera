import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(private prisma: PrismaService) {}

  private readonly defaultWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  private readonly alertsWebhookUrl =
    process.env.SLACK_WEBHOOK_ALERTS || this.defaultWebhookUrl;
  private readonly moderationWebhookUrl =
    process.env.SLACK_WEBHOOK_MODERATION || this.defaultWebhookUrl;
  private readonly paymentsWebhookUrl =
    process.env.SLACK_WEBHOOK_PAYMENTS || this.defaultWebhookUrl;

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

    try {
      await axios.post(webhookUrl, payload);
    } catch (error) {
      this.logger.error('Failed to send Slack message', error);
    }
  }

  async sendProductionAlert(errorInfo: {
    message: string;
    stack?: string;
    path?: string;
  }): Promise<void> {
    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 Production Error 🚨' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Path:*\n${errorInfo.path || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Message:*\n${errorInfo.message}` },
          ],
        },
        ...(errorInfo.stack
          ? [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Stacktrace:*\n\`\`\`${errorInfo.stack.substring(0, 2000)}\`\`\``,
                },
              },
            ]
          : []),
      ],
    };
    await this.sendMessage(this.alertsWebhookUrl, payload);
  }

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
          ],
        },
      ],
    };
    await this.sendMessage(this.moderationWebhookUrl, payload);
  }

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

  // Phase 2: Interactive Moderation
  async handleModerationInteraction(payload: any): Promise<any> {
    const action = payload.actions?.[0];
    const userWhoClicked = payload.user?.username || 'Admin';

    if (!action) return;

    const actionId = action.action_id;
    const value = action.value; // e.g. ignore_123, delete_123, ban_123
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
          if (post) reportedUserId = post.userId;
        } else if (report.targetType === 'COMMENT') {
          const comment = await this.prisma.comment.findUnique({
            where: { id: report.targetId },
          });
          if (comment) reportedUserId = comment.userId;
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

      // To update the message in Slack, we can use the response_url provided in the payload
      if (payload.response_url) {
        await axios.post(payload.response_url, {
          replace_original: true,
          blocks: updatedBlocks,
        });
      }

      return { text: resultText };
    } catch (error) {
      this.logger.error('Error handling moderation interaction', error);
      return { text: '❌ Error executing moderation action' };
    }
  }
}
