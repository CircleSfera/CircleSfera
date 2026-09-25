import type { SupportTicketCreatedEvent } from '@circlesfera/shared';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createTicket(dto: CreateTicketDto & { email: string; userId: string }) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        userId: dto.userId,
      },
    });

    const event: SupportTicketCreatedEvent['payload'] = ticket;
    this.eventEmitter.emit('support.ticket_created', event);

    return {
      success: true,
      message: 'Support ticket created successfully',
      ticketId: ticket.id,
    };
  }
}
