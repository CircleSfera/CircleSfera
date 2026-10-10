import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { EmailService } from '../email/email.service.js';
import { helpdeskFor } from '../helpdesk/helpdesk.module.js';
import { HelpdeskStore } from '../helpdesk/helpdesk.store.js';
import { HelpdeskAgentController } from '../helpdesk/helpdesk-agent.controller.js';
import { HelpdeskDataPort } from '../helpdesk/helpdesk-data.port.js';
import { HelpdeskRequesterController } from '../helpdesk/helpdesk-requester.controller.js';
import { HelpdeskTicketsService } from '../helpdesk/helpdesk-tickets.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackModule } from '../slack/slack.module.js';
import { SlackService } from '../slack/slack.service.js';
import { BrevoInboundController } from './brevo-inbound.controller.js';
import { CircleSferaHelpdeskHostModule } from './circlesfera-helpdesk-host.module.js';

// The internal channel brings in queues and outside services; here only its
// place in the wiring matters.
@Module({
  providers: [{ provide: SlackService, useValue: {} }],
  exports: [SlackService],
})
class QuietSlackModule {}

// The Help Desk plugged into CircleSfera: every contract it asks for is
// provided by the host module, so the application can start.
describe('Help Desk wired to its CircleSfera host', () => {
  it('resolves the store, the tickets service and both controllers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        helpdeskFor(CircleSferaHelpdeskHostModule),
      ],
    })
      .overrideModule(SlackModule)
      .useModule(QuietSlackModule)
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(EmailService)
      .useValue({})
      .compile();

    expect(moduleRef.get(HelpdeskTicketsService)).toBeInstanceOf(
      HelpdeskTicketsService,
    );
    expect(moduleRef.get(HelpdeskStore)).toBeInstanceOf(HelpdeskStore);
    // What the rest of the product may ask is reachable from outside.
    expect(moduleRef.get(HelpdeskDataPort, { strict: false })).toBeInstanceOf(
      HelpdeskDataPort,
    );
    expect(moduleRef.get(HelpdeskRequesterController)).toBeDefined();
    expect(moduleRef.get(HelpdeskAgentController)).toBeDefined();
    // The route of the mail provider reaches the Help Desk through its port.
    expect(moduleRef.get(BrevoInboundController)).toBeDefined();
    // No settings here: email in is off.
    expect(
      moduleRef.get(HelpdeskDataPort, { strict: false }).emailInEnabled(),
    ).toBe(false);
    await moduleRef.close();
  });
});
