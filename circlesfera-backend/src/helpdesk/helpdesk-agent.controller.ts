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
import { AgentAssignmentDto } from './dto/agent-assignment.dto.js';
import { AgentMessageDto } from './dto/agent-message.dto.js';
import { AgentTicketChangesDto } from './dto/agent-ticket-changes.dto.js';
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
  async listTickets(
    @Query() query: AgentTicketsQueryDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.tickets.listTickets(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
      query.category,
      {
        priority: query.priority,
        assignment: query.assignment,
        // "mine" is always who is signed in, never a value of the request.
        agentRef: admin.adminId,
      },
    );
  }

  // The ticket with its whole conversation, internal notes included.
  @Get(':id')
  async getTicket(@Param('id') id: string) {
    return this.tickets.getTicket(id);
  }

  // An answer to the requester or an internal note.
  @Post(':id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body() dto: AgentMessageDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.tickets.addMessage(admin.adminId, id, dto);
  }

  @Patch(':id')
  async updateTicket(
    @Param('id') id: string,
    @Body() body: AgentTicketChangesDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.tickets.updateTicket(admin.adminId, id, body);
  }

  // Takes the ticket, lets go of it, or gives it to someone.
  @Post(':id/assignment')
  async assign(
    @Param('id') id: string,
    @Body() dto: AgentAssignmentDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.tickets.assign(
      // Assigning to someone else needs the permission of who manages the
      // team, which does not exist yet: every agent takes and lets go only.
      { ref: admin.adminId, canManage: false },
      id,
      dto.agentRef ?? null,
    );
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
