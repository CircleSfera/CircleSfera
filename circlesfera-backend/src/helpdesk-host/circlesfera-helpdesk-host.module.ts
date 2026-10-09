import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '../email/email.module.js';
import {
  ACCOUNT_CARD_PROVIDER,
  AGENT_DIRECTORY,
  HANDOVER_GATEWAY,
  ORGANIZATION_SCOPE,
  REQUESTER_DIRECTORY,
  REQUESTER_NOTIFIER,
  STAFF_ACTION_LOG,
  TEAM_CHANNEL,
} from '../helpdesk/helpdesk-host.contracts.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SlackModule } from '../slack/slack.module.js';
import {
  BrevoInboundController,
  InboundTokenGuard,
} from './brevo-inbound.controller.js';
import {
  AdminAuditStaffActionLog,
  CircleSferaAccountCard,
  CircleSferaOrganizationScope,
  CircleSferaRequesterDirectory,
  CircleSferaRequesterNotifier,
  CircleSferaTeamChannel,
  ModerationHandover,
  StaffAgentDirectory,
} from './circlesfera-helpdesk-host.js';

const contracts = [
  { provide: ORGANIZATION_SCOPE, useClass: CircleSferaOrganizationScope },
  { provide: REQUESTER_DIRECTORY, useClass: CircleSferaRequesterDirectory },
  { provide: ACCOUNT_CARD_PROVIDER, useClass: CircleSferaAccountCard },
  { provide: HANDOVER_GATEWAY, useClass: ModerationHandover },
  { provide: REQUESTER_NOTIFIER, useClass: CircleSferaRequesterNotifier },
  { provide: TEAM_CHANNEL, useClass: CircleSferaTeamChannel },
  { provide: STAFF_ACTION_LOG, useClass: AdminAuditStaffActionLog },
  { provide: AGENT_DIRECTORY, useClass: StaffAgentDirectory },
];

/** CircleSfera's side of the Help Desk contracts. */
@Module({
  imports: [PrismaModule, EmailModule, SlackModule, ConfigModule],
  controllers: [BrevoInboundController],
  providers: [...contracts, InboundTokenGuard],
  exports: contracts.map((contract) => contract.provide),
})
export class CircleSferaHelpdeskHostModule {}
