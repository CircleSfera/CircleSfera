import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HelpdeskScheduler } from './helpdesk.scheduler.js';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskAgentController } from './helpdesk-agent.controller.js';
import { HelpdeskArticlesController } from './helpdesk-articles.controller.js';
import { HelpdeskArticlesService } from './helpdesk-articles.service.js';
import { HelpdeskDataPort } from './helpdesk-data.port.js';
import { HelpdeskFiguresService } from './helpdesk-figures.service.js';
import { HelpdeskHelpCentreController } from './helpdesk-help-centre.controller.js';
import { HelpdeskHelpCentreService } from './helpdesk-help-centre.service.js';
import { HelpdeskInboundService } from './helpdesk-inbound.service.js';
import { HelpdeskReplyAddress } from './helpdesk-reply-address.js';
import { HelpdeskRequesterController } from './helpdesk-requester.controller.js';
import { HelpdeskSavedRepliesController } from './helpdesk-saved-replies.controller.js';
import { HelpdeskSavedRepliesService } from './helpdesk-saved-replies.service.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

@Module({})
export class HelpdeskModule {}

/**
 * The Help Desk, plugged into a host: the module that provides the host
 * contracts (see helpdesk-host.contracts.ts) is passed in, so the Help Desk
 * never imports the product around it.
 */
export function helpdeskFor(host: Type<unknown>): DynamicModule {
  return {
    module: HelpdeskModule,
    // The data port is what the rest of the product may ask the Help Desk.
    global: true,
    imports: [PrismaModule, ConfigModule, host],
    controllers: [
      HelpdeskRequesterController,
      HelpdeskAgentController,
      HelpdeskSavedRepliesController,
      HelpdeskArticlesController,
      HelpdeskHelpCentreController,
    ],
    providers: [
      HelpdeskStore,
      HelpdeskTicketsService,
      HelpdeskSavedRepliesService,
      HelpdeskFiguresService,
      HelpdeskArticlesService,
      HelpdeskHelpCentreService,
      HelpdeskReplyAddress,
      HelpdeskInboundService,
      HelpdeskScheduler,
      HelpdeskDataPort,
    ],
    exports: [HelpdeskDataPort],
  };
}
