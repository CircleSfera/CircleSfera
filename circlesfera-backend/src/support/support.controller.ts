import { Body, Controller, Post } from '@nestjs/common';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { SupportService } from './support.service.js';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  async createTicket(@Body() createTicketDto: CreateTicketDto) {
    return this.supportService.createTicket(createTicketDto);
  }
}
