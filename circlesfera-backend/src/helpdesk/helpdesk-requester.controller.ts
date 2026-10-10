import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

// What a requester does: the identity and the email come from the session,
// never from the form.
@Controller('support')
export class HelpdeskRequesterController {
  constructor(
    @Inject(HelpdeskTicketsService)
    private readonly tickets: HelpdeskTicketsService,
  ) {}

  @Post('tickets')
  @UseGuards(JwtAuthGuard)
  async createTicket(
    @CurrentUser() user: CurrentUserData,
    @Body() createTicketDto: CreateTicketDto,
  ) {
    return this.tickets.createTicket({
      ...createTicketDto,
      email: user.email,
      userId: user.userId,
    });
  }
}
