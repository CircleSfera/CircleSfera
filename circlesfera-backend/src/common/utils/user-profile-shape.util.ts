type ProfileSnippet = {
  username: string;
  avatar?: string | null;
  fullName?: string | null;
};

/** Maps a Profile row to the legacy UI shape: `{ profile: { username } }`. */
export function toAdminUser(profile: ProfileSnippet | null | undefined) {
  return profile
    ? {
        profile: {
          username: profile.username,
          avatar: profile.avatar ?? null,
          ...(profile.fullName !== undefined
            ? { fullName: profile.fullName }
            : {}),
        },
      }
    : null;
}

/** Maps User.profiles[0] onto user.profile for list/detail UIs. */
export function withPrimaryProfile<
  T extends { profiles?: ProfileSnippet[] | null },
>(user: T) {
  const primary = user.profiles?.[0] ?? null;
  const { profiles: _profiles, ...rest } = user;
  return {
    ...rest,
    profile: primary
      ? {
          username: primary.username,
          avatar: primary.avatar ?? null,
          ...(primary.fullName !== undefined
            ? { fullName: primary.fullName }
            : {}),
        }
      : null,
  };
}
