import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ORGANIZATION_SCOPE,
  type OrganizationScope,
} from './helpdesk-host.contracts.js';

const LOCAL_PART = /^ticket\+(\d{1,12})\.([0-9a-f]{16})$/;

/**
 * The address a requester answers to: one per ticket, signed, so that
 * knowing the number of a request is not enough to write to it. Without its
 * two settings there are no reply addresses and email in is off.
 */
@Injectable()
export class HelpdeskReplyAddress {
  private readonly domain: string;
  private readonly secret: string;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(ORGANIZATION_SCOPE)
    private readonly organization: OrganizationScope,
  ) {
    this.domain = (config.get<string>('HELPDESK_REPLY_DOMAIN') ?? '')
      .trim()
      .toLowerCase();
    this.secret = (config.get<string>('HELPDESK_REPLY_SECRET') ?? '').trim();
  }

  get enabled(): boolean {
    return this.domain !== '' && this.secret !== '';
  }

  private signature(ticketId: string): string {
    return createHmac('sha256', this.secret)
      .update(`${this.organization.current()}:${ticketId}`)
      .digest('hex')
      .slice(0, 16);
  }

  /** The reply address of a ticket, or nothing while email in is off. */
  for(ticket: { id: string; reference: number }): string | undefined {
    if (!this.enabled) return undefined;
    return `ticket+${ticket.reference}.${this.signature(ticket.id)}@${this.domain}`;
  }

  /** Whether an address is at the domain that receives replies. */
  isReplyDomain(address: string): boolean {
    return (
      this.enabled && address.trim().toLowerCase().endsWith(`@${this.domain}`)
    );
  }

  /**
   * The number of the request an address was made for, as written in it.
   * Nothing when the address is not a reply address. The signature still
   * has to be checked against the ticket of that number.
   */
  referenceIn(
    address: string,
  ): { reference: number; signature: string } | null {
    if (!this.isReplyDomain(address)) return null;
    const local = address.trim().toLowerCase().split('@')[0];
    const found = LOCAL_PART.exec(local);
    return found ? { reference: Number(found[1]), signature: found[2] } : null;
  }

  /** Whether a signature read from an address is the one of this ticket. */
  signed(ticketId: string, signature: string): boolean {
    if (!this.enabled) return false;
    const expected = Buffer.from(this.signature(ticketId));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
