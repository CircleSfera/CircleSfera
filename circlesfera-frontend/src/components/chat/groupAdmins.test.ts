import { describe, expect, it } from 'vitest';
import type { Participant } from '../../types';
import { adminCandidates, isNotice, needsSuccessor } from './groupAdmins';

const member = (
  profileId: string,
  extra: Partial<Participant> = {},
): Participant =>
  ({
    id: `part-${profileId}`,
    profileId,
    hasAccepted: true,
    profile: { id: profileId, username: profileId },
    ...extra,
  }) as Participant;

describe('group admins', () => {
  const group = (participants: Participant[]) => ({
    isGroup: true,
    participants,
  });

  it('offers as admin the members in the group who accepted it and are not admin, never oneself', () => {
    const candidates = adminCandidates(
      group([
        member('me', { isAdmin: true }),
        member('ana'),
        member('leo', { isAdmin: true }),
        member('invited', { hasAccepted: false }),
        member('gone', { deletedAt: '2026-10-01T00:00:00.000Z' }),
      ]),
      'me',
    );

    expect(candidates.map((p) => p.profileId)).toEqual(['ana']);
  });

  it('asks for the next admin only when the person is the only admin and someone could be one', () => {
    expect(
      needsSuccessor(
        group([member('me', { isAdmin: true }), member('ana')]),
        'me',
      ),
    ).toBe(true);
    // Another admin stays.
    expect(
      needsSuccessor(
        group([
          member('me', { isAdmin: true }),
          member('ana', { isAdmin: true }),
        ]),
        'me',
      ),
    ).toBe(false);
    // Not an admin.
    expect(
      needsSuccessor(
        group([member('me'), member('ana', { isAdmin: true })]),
        'me',
      ),
    ).toBe(false);
    // Nobody could take over.
    expect(
      needsSuccessor(
        group([
          member('me', { isAdmin: true }),
          member('invited', { hasAccepted: false }),
        ]),
        'me',
      ),
    ).toBe(false);
    // Not a group, or nobody signed in.
    expect(
      needsSuccessor(
        { isGroup: false, participants: [member('me', { isAdmin: true })] },
        'me',
      ),
    ).toBe(false);
    expect(
      needsSuccessor(
        group([member('me', { isAdmin: true }), member('ana')]),
        undefined,
      ),
    ).toBe(false);
  });

  it('tells a notice from the app apart from a message a member wrote', () => {
    expect(isNotice({ kind: 'ADMIN_GRANTED' })).toBe(true);
    expect(isNotice({ kind: 'USER' })).toBe(false);
    expect(isNotice({})).toBe(false);
  });
});
