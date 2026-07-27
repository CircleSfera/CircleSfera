import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { SupportService } from './support.service.js';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  @UseGuards(JwtAuthGuard)
  async createTicket(
    @CurrentUser() user: CurrentUserData,
    @Body() createTicketDto: CreateTicketDto,
  ) {
    return this.supportService.createTicket({
      ...createTicketDto,
      email: user.email,
      userId: user.userId,
    });
  }
}
