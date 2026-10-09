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

/** An agent of the team, as far as a ticket needs to show. */
export interface AgentSummary {
  ref: string;
  name: string;
}

export interface AgentDirectory {
  /** The names of these agents; the ones the host no longer knows are left out. */
  describe(agentRefs: string[]): Promise<Map<string, string>>;
  /** The agents a ticket can be given to: active, and allowed to answer. */
  assignable(): Promise<AgentSummary[]>;
}

/** How fast a requester is to be answered: with preference, or not. */
export type ServiceLevel = 'STANDARD' | 'PRIORITY';

export interface ServiceLevelProvider {
  /**
   * The service level of a requester, as the host decides it. A requester
   * the host does not know is standard.
   */
  levelOf(requesterRef: string): Promise<ServiceLevel>;
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
  /**
   * The address the requester answers to from their mail app. Empty while
   * email in is off: the email then cannot be answered.
   */
  replyTo?: string;
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
  /**
   * Tells someone whose email matched no request that the address only
   * receives answers to requests, and where a request is opened.
   */
  unmatchedSender(address: string): Promise<void>;
}

export interface TeamChannel {
  /** Tells the team a ticket was opened. */
  ticketOpened(ticket: object): void;
  /** Tells the team the requester answered in a ticket. */
  requesterReplied(ticket: TicketNotice): Promise<void>;
  /** Tells the team that email in needs a look. Counts only. */
  emailInTrouble(trouble: EmailInTrouble): Promise<void>;
}

/** What went wrong with the email that arrived, in numbers. */
export interface EmailInTrouble {
  /** In the last hour: sent to no ticket. */
  noTicket: number;
  /** In the last hour: sent to a ticket by someone who is not its requester. */
  senderMismatch: number;
  /** Kept and still not looked at after a quarter of an hour. */
  stuck: number;
}

export interface StaffActionLog {
  /**
   * Records what someone of the staff did in the host's staff audit log:
   * to a ticket, unless another thing is named.
   */
  record(
    agentRef: string,
    targetId: string,
    details: string,
    target?: 'ticket' | 'article',
  ): Promise<void>;
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
export const AGENT_DIRECTORY = Symbol('helpdesk.agentDirectory');
export const SERVICE_LEVEL_PROVIDER = Symbol('helpdesk.serviceLevelProvider');
export const ACCOUNT_CARD_PROVIDER = Symbol('helpdesk.accountCardProvider');
export const HANDOVER_GATEWAY = Symbol('helpdesk.handoverGateway');
export const REQUESTER_NOTIFIER = Symbol('helpdesk.requesterNotifier');
export const TEAM_CHANNEL = Symbol('helpdesk.teamChannel');
export const STAFF_ACTION_LOG = Symbol('helpdesk.staffActionLog');
