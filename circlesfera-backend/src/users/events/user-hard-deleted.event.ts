export const USER_HARD_DELETED_EVENT = 'user.hard_deleted';

export interface UserHardDeletedPayload {
  userId: string;
  profileId?: string;
  profileIds: string[];
  mediaUrls?: string[];
}

export class UserHardDeletedEvent implements UserHardDeletedPayload {
  readonly userId: string;
  readonly profileId?: string;
  readonly profileIds: string[];
  readonly mediaUrls: string[];

  constructor(payload: {
    userId: string;
    profileId?: string;
    profileIds?: string[];
    mediaUrls?: string[];
  }) {
    this.userId = payload.userId;
    const ids =
      payload.profileIds && payload.profileIds.length > 0
        ? payload.profileIds
        : payload.profileId
          ? [payload.profileId]
          : [];
    this.profileIds = ids;
    this.profileId = payload.profileId ?? ids[0];
    this.mediaUrls = payload.mediaUrls ?? [];
  }
}
