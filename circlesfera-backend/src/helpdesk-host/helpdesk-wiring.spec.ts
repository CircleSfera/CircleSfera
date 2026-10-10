import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { EmailService } from '../email/email.service.js';
import { helpdeskFor } from '../helpdesk/helpdesk.module.js';
import { HelpdeskAgentController } from '../helpdesk/helpdesk-agent.controller.js';
import { HelpdeskRequesterController } from '../helpdesk/helpdesk-requester.controller.js';
import { HelpdeskTicketsService } from '../helpdesk/helpdesk-tickets.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CircleSferaHelpdeskHostModule } from './circlesfera-helpdesk-host.module.js';

// The Help Desk plugged into CircleSfera: every contract it asks for is
// provided by the host module, so the application can start.
describe('Help Desk wired to its CircleSfera host', () => {
  it('resolves the tickets service and both controllers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        helpdeskFor(CircleSferaHelpdeskHostModule),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(EmailService)
      .useValue({})
      .compile();

    expect(moduleRef.get(HelpdeskTicketsService)).toBeInstanceOf(
      HelpdeskTicketsService,
    );
    expect(moduleRef.get(HelpdeskRequesterController)).toBeDefined();
    expect(moduleRef.get(HelpdeskAgentController)).toBeDefined();
    await moduleRef.close();
  });
});
