import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
  ) {}

  async createTicket(dto: CreateTicketDto) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        userId: dto.userId || null,
      },
    });

    // Send alert to Slack asynchronously
    this.slackService.sendSupportAlert(ticket).catch((e) => {
      this.logger.error('Failed to send support ticket alert to Slack', e);
    });

    return {
      success: true,
      message: 'Support ticket created successfully',
      ticketId: ticket.id,
    };
  }
}
