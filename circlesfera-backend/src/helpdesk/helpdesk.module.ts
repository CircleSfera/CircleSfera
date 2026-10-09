import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HelpdeskScheduler } from './helpdesk.scheduler.js';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskAgentController } from './helpdesk-agent.controller.js';
import { HelpdeskDataPort } from './helpdesk-data.port.js';
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
    imports: [PrismaModule, host],
    controllers: [
      HelpdeskRequesterController,
      HelpdeskAgentController,
      HelpdeskSavedRepliesController,
    ],
    providers: [
      HelpdeskStore,
      HelpdeskTicketsService,
      HelpdeskSavedRepliesService,
      HelpdeskScheduler,
      HelpdeskDataPort,
    ],
    exports: [HelpdeskDataPort],
  };
}
