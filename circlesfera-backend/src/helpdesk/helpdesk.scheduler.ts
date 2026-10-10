import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HelpdeskInboundService } from './helpdesk-inbound.service.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

// The work the Help Desk does on a schedule. Each job can run twice without
// harm, and a failure of one run is logged and left for the next.
@Injectable()
export class HelpdeskScheduler {
  private readonly logger = new Logger(HelpdeskScheduler.name);

  constructor(
    @Inject(HelpdeskTicketsService)
    private readonly tickets: HelpdeskTicketsService,
    @Inject(HelpdeskInboundService)
    private readonly inbound: HelpdeskInboundService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async deleteOldInboundEmails(): Promise<void> {
    try {
      const deleted = await this.inbound.deleteOld();
      if (deleted > 0) {
        this.logger.log(`Kept emails past their time deleted: ${deleted}`);
      }
    } catch (err: unknown) {
      this.logger.error(
        `Deleting old kept emails failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async closeSolvedTickets(): Promise<void> {
    try {
      const closed = await this.tickets.closeSolvedTickets();
      if (closed > 0) {
        this.logger.log(`Solved tickets closed: ${closed}`);
      }
    } catch (err: unknown) {
      this.logger.error(
        `Closing solved tickets failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async followUpWaitingTickets(): Promise<void> {
    try {
      const solved = await this.tickets.solveUnansweredTickets();
      const reminded = await this.tickets.remindWaitingTickets();
      if (solved > 0 || reminded > 0) {
        this.logger.log(
          `Waiting tickets: ${reminded} reminded, ${solved} solved without an answer`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Following up waiting tickets failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async returnDecidedHandovers(): Promise<void> {
    try {
      const returned = await this.tickets.returnDecidedHandovers();
      if (returned > 0) {
        this.logger.log(`Tickets back from another team: ${returned}`);
      }
    } catch (err: unknown) {
      this.logger.error(
        `Returning decided handovers failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }
}
