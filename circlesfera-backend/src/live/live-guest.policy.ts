import { ErrorCode, LIVE_GUESTS_MAX } from '@circlesfera/shared';
import type { LiveGuestStatus, LiveStatus } from '@prisma/client';

/**
 * The rules of a live's guests, in one place and with no reads of its own:
 * the live service reads the live and its guests, asks here, and acts on the
 * answer. Every id is a Profile's.
 *
 * A guest invited or on air has a place: a live has at most LIVE_GUESTS_MAX
 * of them at once. A guest who declined, left or was removed has none, and
 * may be invited again.
 */

/** The places of a live's guests: invited, or on air. */
export const GUEST_PLACE_STATUSES: readonly LiveGuestStatus[] = [
  'INVITED',
  'ON_AIR',
];

/** Whether a guest in this state holds one of the live's places. */
export function hasPlace(status: LiveGuestStatus | null | undefined): boolean {
  return !!status && GUEST_PLACE_STATUSES.includes(status);
}

/** Why a guest's request is refused, and how it is answered. */
export interface GuestRefusal {
  kind: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT';
  code: ErrorCode;
  message: string;
}

const refusal = (
  kind: GuestRefusal['kind'],
  code: ErrorCode,
  message: string,
): GuestRefusal => ({ kind, code, message });

interface LiveFacts {
  hostId: string;
  status: LiveStatus;
}

/**
 * Inviting: only the host, only while the live is on, only a Profile that
 * exists, never oneself, never
 * across a block, never a Profile that already has a place, and never past
 * the most a live allows. An invite takes nobody's place.
 */
export function refuseInvite(input: {
  stream: LiveFacts;
  callerId: string;
  // Null: no such Profile.
  inviteeId: string | null;
  blocked: boolean;
  inviteeStatus: LiveGuestStatus | null;
  withPlace: number;
}): GuestRefusal | null {
  if (input.stream.hostId !== input.callerId) {
    return refusal(
      'FORBIDDEN',
      ErrorCode.ONLY_HOST_CAN_INVITE,
      'Only the host can invite a guest',
    );
  }
  if (input.stream.status !== 'LIVE') {
    return refusal(
      'NOT_FOUND',
      ErrorCode.STREAM_NOT_ACTIVE,
      'Stream is not active',
    );
  }
  if (input.inviteeId === null) {
    return refusal(
      'NOT_FOUND',
      ErrorCode.USER_NOT_FOUND,
      'Invited user not found',
    );
  }
  if (input.inviteeId === input.callerId) {
    return refusal(
      'FORBIDDEN',
      ErrorCode.CANNOT_INVITE_SELF,
      'Cannot invite yourself as a guest',
    );
  }
  // Across a block the other Profile is not found, as everywhere else.
  if (input.blocked) {
    return refusal(
      'NOT_FOUND',
      ErrorCode.USER_NOT_FOUND,
      'Invited user not found',
    );
  }
  if (hasPlace(input.inviteeStatus)) {
    return refusal(
      'CONFLICT',
      ErrorCode.LIVE_GUEST_ALREADY_INVITED,
      'Already invited to this live',
    );
  }
  if (input.withPlace >= LIVE_GUESTS_MAX) {
    return refusal(
      'CONFLICT',
      ErrorCode.LIVE_GUESTS_FULL,
      'This live has as many guests as it may',
    );
  }
  return null;
}

/**
 * Accepting: only the Profile invited, while the live is on, with no block
 * between them and the host, and while fewer than the most a live allows are
 * on air. A guest already on air asks again for the token to rejoin, which
 * changes nothing.
 */
export function refuseAccept(input: {
  stream: LiveFacts;
  guestStatus: LiveGuestStatus | null;
  blocked: boolean;
  onAir: number;
}): GuestRefusal | null {
  if (input.stream.status !== 'LIVE') {
    return refusal(
      'NOT_FOUND',
      ErrorCode.STREAM_NOT_ACTIVE,
      'Stream is not active',
    );
  }
  if (!hasPlace(input.guestStatus) || input.blocked) {
    return refusal(
      'FORBIDDEN',
      ErrorCode.NOT_A_LIVE_GUEST,
      'You are not invited to this live',
    );
  }
  if (input.guestStatus === 'INVITED' && input.onAir >= LIVE_GUESTS_MAX) {
    return refusal(
      'CONFLICT',
      ErrorCode.LIVE_GUESTS_FULL,
      'This live has as many guests on air as it may',
    );
  }
  return null;
}

/** Declining: only the Profile invited, before accepting. */
export function refuseDecline(
  guestStatus: LiveGuestStatus | null,
): GuestRefusal | null {
  return guestStatus === 'INVITED'
    ? null
    : refusal(
        'FORBIDDEN',
        ErrorCode.NOT_A_LIVE_GUEST,
        'You are not invited to this live',
      );
}

/** Leaving: only a guest on air. */
export function refuseLeave(
  guestStatus: LiveGuestStatus | null,
): GuestRefusal | null {
  return guestStatus === 'ON_AIR'
    ? null
    : refusal(
        'FORBIDDEN',
        ErrorCode.NOT_A_LIVE_GUEST,
        'You are not on air in this live',
      );
}

/** Removing: only the host, a guest invited or on air. */
export function refuseRemove(input: {
  stream: Pick<LiveFacts, 'hostId'>;
  callerId: string;
  guestStatus: LiveGuestStatus | null;
}): GuestRefusal | null {
  if (input.stream.hostId !== input.callerId) {
    return refusal(
      'FORBIDDEN',
      ErrorCode.ONLY_HOST_CAN_REMOVE,
      'Only the host can remove a guest',
    );
  }
  if (!hasPlace(input.guestStatus)) {
    return refusal(
      'NOT_FOUND',
      ErrorCode.NOT_A_LIVE_GUEST,
      'Not a guest of this live',
    );
  }
  return null;
}
