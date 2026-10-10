import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { RequesterMessageDto } from './dto/requester-message.dto.js';
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

  // The tickets of who is signed in.
  @Get('tickets')
  @UseGuards(JwtAuthGuard)
  async listMyTickets(
    @CurrentUser() user: CurrentUserData,
    @Query() query: PaginationDto,
  ) {
    return this.tickets.listMyTickets(
      user.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  // One of their tickets, with its public messages.
  @Get('tickets/:id')
  @UseGuards(JwtAuthGuard)
  async getMyTicket(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.tickets.getMyTicket(user.userId, id);
  }

  @Post('tickets/:id/messages')
  @UseGuards(JwtAuthGuard)
  async replyToMyTicket(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: RequesterMessageDto,
  ) {
    return this.tickets.replyToMyTicket(user.userId, id, dto);
  }
}
