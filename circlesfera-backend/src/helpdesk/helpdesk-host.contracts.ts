/**
 * What the Help Desk needs from the product it is plugged into (its host).
 * The Help Desk module knows the host only through these contracts; the host
 * implements them outside this module. A contract returns plain data, never
 * a record of the host.
 */

/** Who a requester is, as far as a list of tickets needs to show. */
export interface RequesterSummary {
  id: string;
  email: string;
  profile: {
    username: string;
    avatar: string | null;
    fullName?: string | null;
  } | null;
}

export interface RequesterDirectory {
  /** The requesters behind these references; unknown ones are left out. */
  describe(requesterRefs: string[]): Promise<Map<string, RequesterSummary>>;
}

export interface AccountCardProvider {
  /**
   * Read-only facts about a requester for whoever answers them, or null when
   * the host no longer knows the requester.
   */
  accountCard(requesterRef: string): Promise<Record<string, unknown> | null>;
}

/** Where a case handed to another team stands. */
export interface HandoverCase {
  id: string;
  status: string;
  /** The other team has not decided yet. */
  pending: boolean;
}

export interface HandoverGateway {
  /**
   * Opens a case with the other team for this ticket. Returns null when the
   * requester behind the ticket no longer exists for the host.
   */
  open(ticket: {
    id: string;
    requesterRef: string | null;
    subject: string;
    message: string;
  }): Promise<{ caseRef: string } | null>;
  /** Takes back a case that was opened and could not be linked. */
  withdraw(caseRef: string): Promise<void>;
  cases(caseRefs: string[]): Promise<Map<string, HandoverCase>>;
}

/** What a notice about a ticket needs to know of it. */
export interface TicketNotice {
  id: string;
  reference: number;
  subject: string;
  email: string;
  requesterRef: string | null;
}

export interface RequesterNotifier {
  /**
   * Tells the requester the team answered: by email, and inside the host
   * product when the requester still exists there.
   */
  answer(ticket: TicketNotice, body: string): Promise<void>;
  /**
   * Reminds the requester that the team is waiting for their answer, and
   * that the ticket will be solved in this many days without one.
   */
  remind(ticket: TicketNotice, solvedInDays: number): Promise<void>;
}

export interface TeamChannel {
  /** Tells the team a ticket was opened. */
  ticketOpened(ticket: object): void;
  /** Tells the team the requester answered in a ticket. */
  requesterReplied(ticket: TicketNotice): Promise<void>;
}

export interface StaffActionLog {
  /** Records what an agent did to a ticket in the host's staff audit log. */
  record(agentRef: string, ticketId: string, details: string): Promise<void>;
}

export interface OrganizationScope {
  /**
   * The Help Desk organization the current request belongs to. The host
   * decides it from who is signed in; it never comes from the request.
   */
  current(): string;
}

export const ORGANIZATION_SCOPE = Symbol('helpdesk.organizationScope');
export const REQUESTER_DIRECTORY = Symbol('helpdesk.requesterDirectory');
export const ACCOUNT_CARD_PROVIDER = Symbol('helpdesk.accountCardProvider');
export const HANDOVER_GATEWAY = Symbol('helpdesk.handoverGateway');
export const REQUESTER_NOTIFIER = Symbol('helpdesk.requesterNotifier');
export const TEAM_CHANNEL = Symbol('helpdesk.teamChannel');
export const STAFF_ACTION_LOG = Symbol('helpdesk.staffActionLog');
