/** What of a ticket decides where it stands against its targets. */
export interface MeasuredTicket {
  status: string;
  createdAt: string;
  firstResponseDueAt?: string | null;
  firstRespondedAt?: string | null;
  resolutionDueAt?: string | null;
}

export interface TargetState {
  /** near: a quarter or less of the time is left. past: the time is over. */
  state: 'near' | 'past';
  /** The target that counts now. */
  target: 'first_response' | 'resolution';
  /** Time left when near, time over when past, in milliseconds. */
  ms: number;
}

/**
 * Where an open ticket stands against its next target: the first response
 * until an agent answers, the resolution after that. Nothing for a ticket
 * that is not open (its clock is stopped or it is finished), is not
 * measured, or still has more than a quarter of its time.
 */
export function targetState(
  ticket: MeasuredTicket,
  now: number,
): TargetState | null {
  if (ticket.status !== 'OPEN') return null;
  const awaitingFirst = !ticket.firstRespondedAt && !!ticket.firstResponseDueAt;
  const dueAt = awaitingFirst
    ? ticket.firstResponseDueAt
    : ticket.resolutionDueAt;
  if (!dueAt) return null;
  const due = Date.parse(dueAt);
  const total = due - Date.parse(ticket.createdAt);
  if (Number.isNaN(due) || Number.isNaN(total)) return null;
  const target = awaitingFirst ? 'first_response' : 'resolution';
  const left = due - now;
  if (left < 0) return { state: 'past', target, ms: -left };
  if (left <= total / 4) return { state: 'near', target, ms: left };
  return null;
}

/** A length of time in the largest unit that fits: minutes, hours or days. */
export function shortDuration(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
