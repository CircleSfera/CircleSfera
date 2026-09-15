import { describe, expect, it } from 'vitest';
import {
  USER_HARD_DELETED_EVENT,
  UserHardDeletedEvent,
} from './user-hard-deleted.event.js';

describe('UserHardDeletedEvent', () => {
  it('should define canonical event name', () => {
    expect(USER_HARD_DELETED_EVENT).toBe('user.hard_deleted');
  });

  it('should normalize payload when profileIds array is provided', () => {
    const event = new UserHardDeletedEvent({
      userId: 'user-1',
      profileIds: ['profile-1', 'profile-2'],
    });

    expect(event.userId).toBe('user-1');
    expect(event.profileIds).toEqual(['profile-1', 'profile-2']);
    expect(event.profileId).toBe('profile-1');
  });

  it('should normalize payload when single profileId is provided', () => {
    const event = new UserHardDeletedEvent({
      userId: 'user-2',
      profileId: 'profile-single',
    });

    expect(event.userId).toBe('user-2');
    expect(event.profileIds).toEqual(['profile-single']);
    expect(event.profileId).toBe('profile-single');
  });

  it('should handle empty profiles gracefully', () => {
    const event = new UserHardDeletedEvent({
      userId: 'user-empty',
      profileIds: [],
    });

    expect(event.userId).toBe('user-empty');
    expect(event.profileIds).toEqual([]);
    expect(event.profileId).toBeUndefined();
  });

  it('should respect explicit profileId even when passed alongside profileIds', () => {
    const event = new UserHardDeletedEvent({
      userId: 'user-explicit',
      profileId: 'profile-primary',
      profileIds: ['profile-other', 'profile-primary'],
    });

    expect(event.userId).toBe('user-explicit');
    expect(event.profileIds).toEqual(['profile-other', 'profile-primary']);
    expect(event.profileId).toBe('profile-primary');
  });

  it('should support durable mediaUrls in event payload', () => {
    const event = new UserHardDeletedEvent({
      userId: 'user-media',
      profileIds: ['prof-1'],
      mediaUrls: [
        'https://cdn.example.com/avatar.jpg',
        'https://cdn.example.com/cover.jpg',
      ],
    });

    expect(event.mediaUrls).toEqual([
      'https://cdn.example.com/avatar.jpg',
      'https://cdn.example.com/cover.jpg',
    ]);
  });
});
