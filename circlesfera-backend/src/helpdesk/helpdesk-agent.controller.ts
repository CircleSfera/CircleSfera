import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AgentTicketsQueryDto } from './dto/agent-tickets-query.dto.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

// What an agent does, behind the staff session and the support permission.
@Controller('admin/support/tickets')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('support')
export class HelpdeskAgentController {
  constructor(
    @Inject(HelpdeskTicketsService)
    private readonly tickets: HelpdeskTicketsService,
  ) {}

  @Get()
  async listTickets(@Query() query: AgentTicketsQueryDto) {
    return this.tickets.listTickets(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
      query.category,
    );
  }

  @Patch(':id')
  async updateTicket(
    @Param('id') id: string,
    @Body() body: { status?: 'OPEN' | 'RESOLVED' | 'CLOSED'; reply?: string },
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.tickets.updateTicket(admin.adminId, id, body);
  }

  // Hands the ticket to another team; in CircleSfera, to moderation.
  @Post(':id/escalate')
  async handOver(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.tickets.handOver(admin.adminId, id);
  }

  // Read-only: what the host says about who wrote the ticket.
  @Get(':id/account')
  async accountCard(@Param('id') id: string) {
    return this.tickets.accountCard(id);
  }
}
