import { LIVE_GUESTS_MAX } from '@circlesfera/shared';
import { describe, expect, it } from 'vitest';
import {
  hasPlace,
  refuseAccept,
  refuseDecline,
  refuseInvite,
  refuseLeave,
  refuseRemove,
} from './live-guest.policy.js';

const onAir = { hostId: 'host', status: 'LIVE' as const };
const codeOf = (refusal: { code: string } | null) => refusal?.code ?? null;

describe("the rules of a live's guests", () => {
  it('a guest invited or on air has a place; one who declined, left or was removed has none', () => {
    expect(hasPlace('INVITED')).toBe(true);
    expect(hasPlace('ON_AIR')).toBe(true);
    for (const status of ['DECLINED', 'LEFT', 'REMOVED', null, undefined]) {
      expect(hasPlace(status as never)).toBe(false);
    }
  });

  describe('inviting', () => {
    const invite = (over: Partial<Parameters<typeof refuseInvite>[0]> = {}) =>
      refuseInvite({
        stream: onAir,
        callerId: 'host',
        inviteeId: 'ana',
        blocked: false,
        inviteeStatus: null,
        withPlace: 0,
        ...over,
      });

    it('lets the host invite a Profile while the live is on', () => {
      expect(invite()).toBeNull();
    });

    it('lets the host invite again a Profile who declined, left or was removed', () => {
      for (const inviteeStatus of ['DECLINED', 'LEFT', 'REMOVED'] as const) {
        expect(invite({ inviteeStatus })).toBeNull();
      }
    });

    it('takes up to the most guests a live allows, and never one more', () => {
      expect(LIVE_GUESTS_MAX).toBe(3);
      expect(invite({ withPlace: LIVE_GUESTS_MAX - 1 })).toBeNull();
      expect(invite({ withPlace: LIVE_GUESTS_MAX })).toEqual({
        kind: 'CONFLICT',
        code: 'LIVE_GUESTS_FULL',
        message: expect.any(String),
      });
    });

    it.each([
      [
        'anyone but the host',
        { callerId: 'other' },
        'FORBIDDEN',
        'ONLY_HOST_CAN_INVITE',
      ],
      [
        'a live that ended',
        { stream: { ...onAir, status: 'ENDED' as const } },
        'NOT_FOUND',
        'STREAM_NOT_ACTIVE',
      ],
      [
        'a Profile that does not exist',
        { inviteeId: null },
        'NOT_FOUND',
        'USER_NOT_FOUND',
      ],
      [
        'the host themself',
        { inviteeId: 'host' },
        'FORBIDDEN',
        'CANNOT_INVITE_SELF',
      ],
      [
        'a Profile across a block',
        { blocked: true },
        'NOT_FOUND',
        'USER_NOT_FOUND',
      ],
      [
        'a Profile already invited',
        { inviteeStatus: 'INVITED' as const },
        'CONFLICT',
        'LIVE_GUEST_ALREADY_INVITED',
      ],
      [
        'a Profile already on air',
        { inviteeStatus: 'ON_AIR' as const },
        'CONFLICT',
        'LIVE_GUEST_ALREADY_INVITED',
      ],
    ])('refuses %s', (_label, over, kind, code) => {
      expect(invite(over)).toMatchObject({ kind, code });
    });
  });

  describe('accepting', () => {
    const accept = (over: Partial<Parameters<typeof refuseAccept>[0]> = {}) =>
      refuseAccept({
        stream: onAir,
        guestStatus: 'INVITED',
        blocked: false,
        onAir: 0,
        ...over,
      });

    it('lets the invited Profile go on air while fewer than the most are on air', () => {
      expect(accept({ onAir: LIVE_GUESTS_MAX - 1 })).toBeNull();
    });

    it('lets a guest already on air ask again, whoever else is on air', () => {
      expect(
        accept({ guestStatus: 'ON_AIR', onAir: LIVE_GUESTS_MAX }),
      ).toBeNull();
    });

    it('refuses an invited Profile when the most guests are on air', () => {
      expect(codeOf(accept({ onAir: LIVE_GUESTS_MAX }))).toBe(
        'LIVE_GUESTS_FULL',
      );
    });

    it('refuses a live that ended, a Profile not invited, and one across a block', () => {
      expect(codeOf(accept({ stream: { ...onAir, status: 'ENDED' } }))).toBe(
        'STREAM_NOT_ACTIVE',
      );
      for (const guestStatus of [
        null,
        'DECLINED',
        'LEFT',
        'REMOVED',
      ] as const) {
        expect(codeOf(accept({ guestStatus }))).toBe('NOT_A_LIVE_GUEST');
      }
      expect(codeOf(accept({ blocked: true }))).toBe('NOT_A_LIVE_GUEST');
    });
  });

  it('declining is only for a Profile invited and not on air yet', () => {
    expect(refuseDecline('INVITED')).toBeNull();
    for (const status of [
      null,
      'ON_AIR',
      'DECLINED',
      'LEFT',
      'REMOVED',
    ] as const) {
      expect(codeOf(refuseDecline(status))).toBe('NOT_A_LIVE_GUEST');
    }
  });

  it('leaving is only for a guest on air', () => {
    expect(refuseLeave('ON_AIR')).toBeNull();
    for (const status of [
      null,
      'INVITED',
      'DECLINED',
      'LEFT',
      'REMOVED',
    ] as const) {
      expect(codeOf(refuseLeave(status))).toBe('NOT_A_LIVE_GUEST');
    }
  });

  it('removing is for the host, of a guest invited or on air', () => {
    const remove = (callerId: string, guestStatus: never) =>
      refuseRemove({ stream: onAir, callerId, guestStatus });
    expect(remove('host', 'INVITED' as never)).toBeNull();
    expect(remove('host', 'ON_AIR' as never)).toBeNull();
    expect(remove('ana', 'ON_AIR' as never)).toMatchObject({
      kind: 'FORBIDDEN',
      code: 'ONLY_HOST_CAN_REMOVE',
    });
    for (const status of [null, 'DECLINED', 'LEFT', 'REMOVED']) {
      expect(remove('host', status as never)).toMatchObject({
        kind: 'NOT_FOUND',
        code: 'NOT_A_LIVE_GUEST',
      });
    }
  });
});
