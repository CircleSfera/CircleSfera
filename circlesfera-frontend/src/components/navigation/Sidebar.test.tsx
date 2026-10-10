import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi, notificationsApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationsStore } from '../../stores/notificationsStore';
import { useUIStore } from '../../stores/uiStore';
import { renderWithProviders } from '../../test/test-utils';
import Sidebar from './Sidebar';

vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);
vi.mock('../../services', () => ({
  chatApi: { getUnreadCount: vi.fn() },
  notificationsApi: { getUnreadCount: vi.fn() },
}));

const logout = vi.fn();

function show(
  path = '/',
  profile: object = { username: 'ana', accountType: 'PERSONAL' },
  compact = false,
) {
  useAuthStore.setState({
    profile: profile as never,
    isAuthenticated: true,
    logout,
  });
  return renderWithProviders(<Sidebar compact={compact} />, {
    routerProps: { initialEntries: [path], useTransitions: false },
  });
}
const nav = () =>
  within(screen.getByRole('navigation', { name: 'Main navigation' }));
const current = () =>
  screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page');

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationsStore.setState({ unreadCount: 0, unreadMessagesCount: 0 });
    useUIStore.setState({ isCreateMenuOpen: false });
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({
      data: { count: 0 },
    } as never);
    vi.mocked(chatApi.getUnreadCount).mockResolvedValue({
      data: { count: 0 },
    } as never);
  });

  it('lists the sections of the app, each leading to its address', () => {
    show();
    const links = nav()
      .getAllByRole('link')
      .map((link) => [
        link.getAttribute('aria-label'),
        link.getAttribute('href'),
      ]);

    expect(links).toEqual([
      ['Home', '/'],
      ['Search', '/explore'],
      ['Frames', '/frames'],
      ['Messages', '/direct/inbox'],
      ['Notifications', '/notifications'],
      ['Saved', '/saved'],
      ['Studio', '/edits'],
      ['Profile', '/ana'],
    ]);
    expect(screen.getByRole('link', { name: 'Premium' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/accounts',
    );
    expect(screen.getByRole('link', { name: 'CircleSfera' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it.each([
    ['CREATOR', true],
    ['BUSINESS', true],
    ['PERSONAL', false],
    [undefined, false],
  ])(
    'offers the creator studio to a %s account: %s',
    (accountType, offered) => {
      show('/', { username: 'ana', accountType });
      expect(!!nav().queryByRole('link', { name: 'Creator Studio' })).toBe(
        offered,
      );
    },
  );

  it.each([
    ['/', 'Home'],
    ['/explore', 'Search'],
    ['/explore/places/p1', 'Search'],
    ['/direct/inbox', 'Messages'],
    ['/ana', 'Profile'],
  ])('marks the section of %s as the open one', (path, section) => {
    show(path);
    expect(current().map((link) => link.getAttribute('aria-label'))).toEqual([
      section,
    ]);
  });

  it.each([
    ['/explorer', 'the profile of someone whose name starts like a section'],
    ['/ben', 'the profile of someone else'],
    ['/accounts', 'a screen that is not in the list'],
  ])('marks no section on %s (%s)', (path) => {
    show(path);
    expect(current()).toHaveLength(0);
  });

  it('opens the create menu from its button', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(useUIStore.getState().isCreateMenuOpen).toBe(true);
  });

  it('signs out from its button', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('reads how much is unread and shows it on messages and notifications', async () => {
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({
      data: { count: 7 },
    } as never);
    vi.mocked(chatApi.getUnreadCount).mockResolvedValue({
      data: { count: 150 },
    } as never);
    show();

    await waitFor(() =>
      expect(useNotificationsStore.getState().unreadCount).toBe(7),
    );
    expect(useNotificationsStore.getState().unreadMessagesCount).toBe(150);
    const messages = within(screen.getByRole('link', { name: 'Messages' }));
    const notifications = within(
      screen.getByRole('link', { name: 'Notifications' }),
    );
    // Once on the narrow rail and once on the wide one.
    expect(messages.getAllByText('99+')).toHaveLength(2);
    expect(notifications.getAllByText('7')).toHaveLength(2);
    expect(
      within(screen.getByRole('link', { name: 'Home' })).queryByText(/\d/),
    ).toBeNull();
  });

  it('asks for nothing when nobody is signed in, and leads the profile entry home', () => {
    useAuthStore.setState({ profile: null, isAuthenticated: false, logout });
    renderWithProviders(<Sidebar />);

    expect(notificationsApi.getUnreadCount).not.toHaveBeenCalled();
    expect(chatApi.getUnreadCount).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('stays as a narrow rail at every width when asked to', () => {
    const wide = show('/', undefined, false);
    expect(wide.container.querySelector('.sidebar-root')?.className).toContain(
      'xl:w-65',
    );
    wide.unmount();

    const narrow = show('/', undefined, true);
    const root = narrow.container.querySelector('.sidebar-root') as HTMLElement;
    expect(root.className).toContain('sidebar-compact');
    expect(root.className).not.toContain('xl:w-65');
  });
});
