import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import {
  ACCOUNT_CARD_PROVIDER,
  HANDOVER_GATEWAY,
  REQUESTER_DIRECTORY,
  REQUESTER_NOTIFIER,
  STAFF_ACTION_LOG,
  TEAM_CHANNEL,
} from '../helpdesk/helpdesk-host.contracts.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import {
  AdminAuditStaffActionLog,
  CircleSferaAccountCard,
  CircleSferaRequesterDirectory,
  EmailRequesterNotifier,
  EventTeamChannel,
  ModerationHandover,
} from './circlesfera-helpdesk-host.js';

const contracts = [
  { provide: REQUESTER_DIRECTORY, useClass: CircleSferaRequesterDirectory },
  { provide: ACCOUNT_CARD_PROVIDER, useClass: CircleSferaAccountCard },
  { provide: HANDOVER_GATEWAY, useClass: ModerationHandover },
  { provide: REQUESTER_NOTIFIER, useClass: EmailRequesterNotifier },
  { provide: TEAM_CHANNEL, useClass: EventTeamChannel },
  { provide: STAFF_ACTION_LOG, useClass: AdminAuditStaffActionLog },
];

/** CircleSfera's side of the Help Desk contracts. */
@Module({
  imports: [PrismaModule, EmailModule],
  providers: contracts,
  exports: contracts.map((contract) => contract.provide),
})
export class CircleSferaHelpdeskHostModule {}
