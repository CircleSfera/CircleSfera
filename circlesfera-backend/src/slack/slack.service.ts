import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

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
}
