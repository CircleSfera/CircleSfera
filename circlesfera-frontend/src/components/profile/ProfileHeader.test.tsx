import { fireEvent, screen } from '@testing-library/react';
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

  it('says a profile is a verified company only when the server says so', () => {
    const { i18n, unmount } = renderWithProviders(
      <ProfileHeader
        {...headerProps}
        profile={{
          data: { ...ownProfile.data, companyVerified: true },
        }}
      />,
    );
    expect(
      screen.getByText(i18n!.t('profile.company_verified')),
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(<ProfileHeader {...headerProps} />);
    expect(
      screen.queryByText(i18n!.t('profile.company_verified')),
    ).not.toBeInTheDocument();
  });

  it('offers the creator mode switch to creator and business accounts only', () => {
    const withAccount = (accountType: string) => ({
      data: { ...ownProfile.data, accountType } as ProfileWithUser,
    });
    const { i18n, rerender } = renderWithProviders(
      <ProfileHeader {...headerProps} profile={withAccount('PERSONAL')} />,
    );
    const name = i18n!.t('profile.creator_mode.label');

    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();

    for (const accountType of ['CREATOR', 'BUSINESS']) {
      rerender(
        <ProfileHeader {...headerProps} profile={withAccount(accountType)} />,
      );
      // One switch, the one of the phone layout: on desktop it changes nothing.
      expect(screen.getAllByRole('button', { name })).toHaveLength(1);
    }
  });

  it('shows the creator mode switch on or off, and flips it', () => {
    const setCreatorMode = vi.fn();
    const creator = {
      data: { ...ownProfile.data, accountType: 'CREATOR' } as ProfileWithUser,
    };
    const { i18n, rerender } = renderWithProviders(
      <ProfileHeader
        {...headerProps}
        profile={creator}
        setCreatorMode={setCreatorMode}
      />,
    );
    const name = i18n!.t('profile.creator_mode.label');

    expect(screen.getByRole('button', { name })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name }));
    expect(setCreatorMode).toHaveBeenCalledWith(true);

    rerender(
      <ProfileHeader
        {...headerProps}
        profile={creator}
        isCreatorModeActive
        setCreatorMode={setCreatorMode}
      />,
    );
    expect(screen.getByRole('button', { name })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
