import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { ProfileWithUser } from '../../types';
import ProfileHeader from './ProfileHeader';

const sells = vi.hoisted(() => ({ value: true }));
const bizStats = vi.hoisted(() => ({ record: vi.fn(), visit: vi.fn() }));
vi.mock('../../services/businessStats.service', () => ({
  businessStatsApi: { record: bizStats.record },
  recordBusinessVisit: bizStats.visit,
}));
vi.mock('../../utils/sellsInApp', () => ({ sellsInApp: () => sells.value }));

vi.mock('../../hooks/useCloseFriendsList', () => ({
  useCloseFriendsList: () => ({
    closeFriendsCount: 0,
    isCloseFriend: false,
    toggle: vi.fn(),
    isLoading: false,
  }),
}));

const restriction = vi.hoisted(() => ({
  state: { restricted: false, isKnown: true, isPending: false },
  toggle: vi.fn(),
  enabledWith: [] as boolean[],
}));
vi.mock('../../hooks/useRestriction', () => ({
  useRestriction: (_username: string, enabled: boolean) => {
    restriction.enabledWith.push(enabled);
    return { ...restriction.state, toggle: restriction.toggle };
  },
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
  onOpenStories: vi.fn(),
  showMenu: false,
  setShowMenu: vi.fn(),
};

describe('ProfileHeader', () => {
  it('names the followers and following buttons by what they show, the count included', () => {
    const setShowFollowsModal = vi.fn();
    renderWithProviders(
      <ProfileHeader
        {...headerProps}
        setShowFollowsModal={setShowFollowsModal}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^0\s*Followers$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^0\s*Following$/ }));

    expect(setShowFollowsModal.mock.calls).toEqual([
      ['followers'],
      ['following'],
    ]);
  });

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

  it('shows "Verified company" beside the name only when the server says so', () => {
    const { i18n, unmount } = renderWithProviders(
      <ProfileHeader
        {...headerProps}
        profile={{
          data: { ...ownProfile.data, verifiedCompany: true } as never,
        }}
      />,
    );
    const marks = screen.getAllByRole('img', {
      name: i18n!.t('profile.badges.company'),
    });
    // One beside the name on a phone, one on a wide screen.
    expect(marks).toHaveLength(2);
    unmount();

    renderWithProviders(<ProfileHeader {...headerProps} />);
    expect(
      screen.queryByRole('img', { name: i18n!.t('profile.badges.company') }),
    ).not.toBeInTheDocument();
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

  it('offers to restrict or unrestrict another profile from its menu, asking only once it is open', () => {
    const other = { ...headerProps, isMe: false, showMenu: true };
    restriction.enabledWith.length = 0;
    const { unmount } = renderWithProviders(<ProfileHeader {...other} />);

    expect(restriction.enabledWith).toContain(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Restrict' })[0]);
    expect(restriction.toggle).toHaveBeenCalledTimes(1);
    expect(other.setShowMenu).toHaveBeenCalled();
    unmount();

    restriction.state = { restricted: true, isKnown: true, isPending: false };
    renderWithProviders(<ProfileHeader {...other} />);
    expect(
      screen.getAllByRole('button', { name: 'Unrestrict' }).length,
    ).toBeGreaterThan(0);
    restriction.state = { restricted: false, isKnown: true, isPending: false };
  });

  it('counts a visit to a Business Profile and the taps on its buttons, never one\u2019s own', () => {
    bizStats.record.mockClear();
    bizStats.visit.mockClear();
    const business = {
      data: {
        ...ownProfile.data,
        id: 'biz-1',
        accountType: 'BUSINESS',
        contactPhone: '+34600111222',
        website: 'shop.es',
      } as never,
    };
    const { unmount } = renderWithProviders(
      <ProfileHeader {...headerProps} isMe={false} profile={business} />,
    );
    expect(bizStats.visit).toHaveBeenCalledWith('biz-1');
    fireEvent.click(screen.getByRole('link', { name: 'Call +34600111222' }));
    fireEvent.click(screen.getByRole('link', { name: /shop\.es/ }));
    expect(bizStats.record.mock.calls).toEqual([
      ['biz-1', 'call'],
      ['biz-1', 'website'],
    ]);
    unmount();

    bizStats.record.mockClear();
    bizStats.visit.mockClear();
    renderWithProviders(
      <ProfileHeader {...headerProps} isMe profile={business} />,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Call +34600111222' }));
    expect(bizStats.visit).not.toHaveBeenCalled();
    expect(bizStats.record).not.toHaveBeenCalled();
  });
});
