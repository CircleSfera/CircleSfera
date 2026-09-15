import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { ProfileWithUser } from '../../types';
import ProfileHeader from './ProfileHeader';

vi.mock('../../hooks/useCloseFriendsList', () => ({
  useCloseFriendsList: () => ({
    closeFriendsCount: 0,
    isCloseFriend: false,
    toggle: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('../FollowButton', () => ({
  default: () => <button type="button">Follow stub</button>,
}));

const ownProfile = {
  data: {
    id: 'p1',
    username: 'alice',
    fullName: 'Alice Doe',
    bio: null,
    avatar: null,
    isPrivate: false,
    _count: { posts: 0, followers: 0, following: 0 },
    verificationLevel: 'BASIC' as const,
    user: { id: 'u1', email: 'test@example.com', createdAt: new Date() },
  } as ProfileWithUser,
};

const headerProps = {
  profile: ownProfile,
  isMe: true,
  hasActiveStories: false,
  isCreatorModeActive: false,
  setCreatorMode: vi.fn(),
  openCreateMenu: vi.fn(),
  isCreatingChat: false,
  handleMessageClick: vi.fn(),
  setShowFollowsModal: vi.fn(),
  setShowReportModal: vi.fn(),
  setShowBlockModal: vi.fn(),
  setShowTipModal: vi.fn(),
  onOpenStories: vi.fn(),
  showMenu: false,
  setShowMenu: vi.fn(),
};

describe('ProfileHeader', () => {
  it('labels own create/settings chrome from the EN catalog', () => {
    const { i18n } = renderWithProviders(<ProfileHeader {...headerProps} />);

    expect(
      screen.getAllByLabelText(i18n!.t('profile.actions.create_post')).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText(i18n!.t('profile.actions.settings')).length,
    ).toBeGreaterThan(0);
    expect(i18n!.t('profile.actions.create_post')).toBe('Create new post');
    expect(
      screen.queryByLabelText('Crear publicación'),
    ).not.toBeInTheDocument();
  });

  it('uses Spanish create/settings labels when locale is es', () => {
    const { i18n } = renderWithProviders(<ProfileHeader {...headerProps} />, {
      lng: 'es',
    });

    expect(
      screen.getAllByLabelText(i18n!.t('profile.actions.create_post')).length,
    ).toBeGreaterThan(0);
    expect(i18n!.t('profile.actions.create_post')).toBe('Crear publicación');
    expect(screen.queryByLabelText('Create new post')).not.toBeInTheDocument();
  });

  it('shows private account chrome from the catalog', () => {
    const { i18n } = renderWithProviders(
      <ProfileHeader
        {...headerProps}
        profile={{
          data: { ...ownProfile.data, isPrivate: true },
        }}
      />,
    );

    expect(
      screen.getByText(i18n!.t('profile.private_label')),
    ).toBeInTheDocument();
  });
});
