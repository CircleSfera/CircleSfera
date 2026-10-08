import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

// The work the Help Desk does on a schedule. Each job can run twice without
// harm, and a failure of one run is logged and left for the next.
@Injectable()
export class HelpdeskScheduler {
  private readonly logger = new Logger(HelpdeskScheduler.name);

  constructor(
    @Inject(HelpdeskTicketsService)
    private readonly tickets: HelpdeskTicketsService,
  ) {}

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
