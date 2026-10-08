import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

/**
 * What the rest of the product may ask the Help Desk: the export of a
 * person's requests, the retention of ended tickets, the figures other
 * screens show, and an answer written in the team's channel. Nothing
 * outside the Help Desk reads or writes its tables; it asks here.
 */
@Injectable()
export class HelpdeskDataPort {
  constructor(
    @Inject(HelpdeskStore) private readonly store: HelpdeskStore,
    // The tickets service tells the team's channel, and that channel answers
    // through this port: it is looked up when needed, not when this is built.
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * The requests a person wrote, each with what was said to and by them.
   * Internal notes of the team are not part of it.
   */
  exportForRequester(requesterRef: string) {
    return this.store.requesterExport(requesterRef);
  }

  /**
   * Deletes solved and closed tickets that ended before a moment, with
   * their messages. Open tickets are never deleted by retention.
   */
  deleteEndedBefore(moment: Date): Promise<{ count: number }> {
    return this.store.deleteEndedBefore(moment);
  }

  /** Id, state and times of the tickets that changed since a moment. */
  ticketFactsSince(moment: Date) {
    return this.store.ticketFactsSince(moment);
  }

  /** The open tickets, newest first, and how many there are. */
  openTickets(take: number) {
    return this.store.openTickets(take);
  }

  /** When tickets solved since a moment were opened and solved. */
  resolutionTimesSince(moment: Date, limit: number) {
    return this.store.resolutionTimesSince(moment, limit);
  }

  /**
   * An answer of the team written outside the Help Desk. False when the
   * ticket cannot be answered.
   */
  answerFromTeamChannel(ticketId: string, text: string): Promise<boolean> {
    return this.moduleRef
      .get(HelpdeskTicketsService, { strict: false })
      .answerFromTeamChannel(ticketId, text);
  }
}
