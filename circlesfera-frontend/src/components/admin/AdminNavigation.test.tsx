import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../locales/en.json';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { renderWithProviders } from '../../test/test-utils';
import AdminShell from './AdminShell';
import { ADMIN_TAB_PERMISSIONS, type AdminTab, navItemsFor } from './adminNav';

const site = vi.hoisted(() => ({ backoffice: false }));

vi.mock('../../services/admin.service', () => ({
  adminApi: { getTrustQueue: vi.fn() },
}));
vi.mock('../../utils/adminPanel', async (original) => ({
  ...(await original<typeof import('../../utils/adminPanel')>()),
  isBackofficeHost: () => site.backoffice,
  adminPanelOrigin: () => 'https://admin.circlesfera.test',
  backofficeOrigin: () => 'https://backoffice.circlesfera.test',
  platformOrigin: () => 'https://circlesfera.test',
}));
vi.mock('./CommandPalette', () => ({
  CommandPalette: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <button type="button" onClick={onClose}>
        palette open
      </button>
    ) : null,
}));

const api = vi.mocked(adminApi);
const onTabChange = vi.fn();
const logout = vi.fn();

/** The English name of a section, read from the catalog by its key. */
const text = (key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      en,
    ) as string;
const label = (tab: AdminTab, from: 'admin' | 'backoffice' = 'admin') =>
  text(
    (navItemsFor(from).find((item) => item.id === tab) as { labelKey: string })
      .labelKey,
  );

function show(
  activeTab: AdminTab = 'users',
  permissions: string[] | 'all' = 'all',
  admin: object | null = { displayName: 'Ana Staff', email: 'ana@staff.test' },
) {
  useAdminAuthStore.setState({
    admin,
    logout,
    hasPermission: (key: string) =>
      permissions === 'all' || permissions.includes(key),
  } as never);
  return renderWithProviders(
    <AdminShell activeTab={activeTab} onTabChange={onTabChange}>
      <p>section content</p>
    </AdminShell>,
  );
}

const sidebar = () => screen.getByRole('complementary');
/** The name of a section button, without the count or tag next to it. */
const sectionName = (button: HTMLElement) =>
  button.querySelector('span.truncate')?.textContent;
const openDrawer = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  return screen.findByRole('dialog', { name: 'Navigation' });
};

describe('staff panel navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    site.backoffice = false;
    logout.mockResolvedValue(undefined);
    api.getTrustQueue.mockResolvedValue({
      data: { counts: { reports: 0, appeals: 0, riskCases: 0, tickets: 0 } },
    } as never);
  });
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('frames the section with the site name and the section name', () => {
    show('users');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Admin Panel' }),
    ).toBeInTheDocument();
    expect(screen.getByText('section content')).toBeInTheDocument();
    expect(
      screen.getByRole('banner').querySelector('p.truncate'),
    ).toHaveTextContent(label('users'));
  });

  it('calls itself Backoffice on the business site and lists its sections only', () => {
    site.backoffice = true;
    show('plans');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Backoffice' }),
    ).toBeInTheDocument();
    const names = within(sidebar()).getAllByRole('button').map(sectionName);
    expect(names).toEqual(
      navItemsFor('backoffice').map((item) => text(item.labelKey)),
    );
    expect(
      within(sidebar()).queryByRole('button', { name: label('users') }),
    ).not.toBeInTheDocument();
  });

  it('lists every section of the Admin Panel to someone who may open them all', () => {
    show('users');

    const names = within(sidebar()).getAllByRole('button').map(sectionName);
    expect(names).toEqual(
      navItemsFor('admin').map((item) => text(item.labelKey)),
    );
  });

  it('lists only the sections the person may open, and no empty group', () => {
    show('posts', ['content']);

    const allowed = navItemsFor('admin').filter(
      (item) =>
        item.id !== 'overview' && ADMIN_TAB_PERMISSIONS[item.id] === 'content',
    );
    expect(allowed.length).toBeGreaterThan(0);
    expect(within(sidebar()).getAllByRole('button').map(sectionName)).toEqual(
      allowed.map((item) => text(item.labelKey)),
    );
    expect(within(sidebar()).getAllByRole('heading', { level: 3 }).length).toBe(
      new Set(
        allowed.map(
          (item) =>
            within(sidebar())
              .getByRole('button', { name: text(item.labelKey) })
              .closest('.space-y-1')
              ?.parentElement?.querySelector('h3')?.textContent,
        ),
      ).size,
    );
  });

  it('marks the open section and changes section on a click', () => {
    show('users');

    const current = within(sidebar()).getByRole('button', {
      name: label('users'),
    });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveClass('min-h-11');
    const other = within(sidebar()).getByRole('button', {
      name: label('posts'),
    });
    expect(other).not.toHaveAttribute('aria-current');

    fireEvent.click(other);
    expect(onTabChange).toHaveBeenCalledWith('posts');
  });

  it('shows how much waits in each queue, and the total on the trust queue', async () => {
    api.getTrustQueue.mockResolvedValue({
      data: { counts: { reports: 4, appeals: 2, riskCases: 3, tickets: 1 } },
    } as never);
    show('users');

    const item = (tab: AdminTab) =>
      within(sidebar()).getByText(label(tab)).closest('button') as HTMLElement;
    await waitFor(() => expect(item('trust')).toHaveTextContent('10'));
    expect(item('reports')).toHaveTextContent('4');
    expect(item('appeals')).toHaveTextContent('2');
    expect(item('spam-review')).toHaveTextContent('3');
    expect(item('posts').querySelector('.font-bold')).toBeNull();
  });

  it('shows the open support tickets on the business site, in the list and in the sheet', async () => {
    site.backoffice = true;
    api.getTrustQueue.mockResolvedValue({
      data: { counts: { reports: 0, appeals: 0, riskCases: 0, tickets: 6 } },
    } as never);
    show('plans');

    const inList = within(sidebar())
      .getByText(label('support', 'backoffice'))
      .closest('button') as HTMLElement;
    await waitFor(() => expect(inList).toHaveTextContent('6'));

    const sheet = await openDrawer();
    expect(
      within(sheet).getByText(label('support', 'backoffice')).closest('button'),
    ).toHaveTextContent('6');
  });

  it('shows no count where nothing waits', async () => {
    show('users');
    await waitFor(() => expect(api.getTrustQueue).toHaveBeenCalled());

    for (const tab of ['trust', 'reports', 'appeals', 'spam-review'] as const) {
      const item = within(sidebar())
        .getByText(label(tab))
        .closest('button') as HTMLElement;
      expect(item.querySelector('.font-bold')).toBeNull();
    }
  });

  it('opens the sections as a sheet on a phone, with the same permissions and counts', async () => {
    api.getTrustQueue.mockResolvedValue({
      data: { counts: { reports: 4, appeals: 0, riskCases: 0, tickets: 0 } },
    } as never);
    show('reports', ['reports', 'content']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const sheet = await openDrawer();

    expect(document.body.style.overflow).toBe('hidden');
    expect(within(sheet).getByText('Choose a section')).toBeInTheDocument();
    const current = within(sheet)
      .getByText(label('reports'))
      .closest('button') as HTMLElement;
    expect(current).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(current).toHaveTextContent('4'));
    expect(
      within(sheet).getByText(label('trust')).closest('button'),
    ).toHaveTextContent('4');
    expect(within(sheet).getByText(label('posts'))).toBeInTheDocument();
    expect(within(sheet).queryByText(label('users'))).not.toBeInTheDocument();
  });

  it('changes section from the sheet and closes it', async () => {
    show('users');
    const sheet = await openDrawer();

    fireEvent.click(
      within(sheet).getByText(label('posts')).closest('button') as HTMLElement,
    );

    expect(onTabChange).toHaveBeenCalledWith('posts');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('');
  });

  it.each([
    [
      'its close button',
      (sheet: HTMLElement) =>
        fireEvent.click(within(sheet).getByRole('button', { name: 'Close' })),
    ],
    [
      'the backdrop',
      (sheet: HTMLElement) =>
        fireEvent.click(sheet.previousElementSibling as HTMLElement),
    ],
    [
      'Escape',
      (sheet: HTMLElement) => fireEvent.keyDown(sheet, { key: 'Escape' }),
    ],
  ])(
    'closes the sheet with %s without changing section',
    async (_how, close) => {
      show('users');
      const sheet = await openDrawer();

      close(sheet);

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(onTabChange).not.toHaveBeenCalled();
    },
  );

  it('keeps the keyboard inside the sheet while it is open', async () => {
    show('users');
    const sheet = await openDrawer();

    const inside = within(sheet).getAllByRole('button');
    await waitFor(() => expect(inside[0]).toHaveFocus());
    inside[inside.length - 1].focus();
    fireEvent.keyDown(sheet, { key: 'Tab' });
    expect(inside[0]).toHaveFocus();
    fireEvent.keyDown(sheet, { key: 'Tab', shiftKey: true });
    expect(inside[inside.length - 1]).toHaveFocus();
  });

  it('closes the sheet as soon as its slide ends', async () => {
    show('users');
    const sheet = await openDrawer();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    // A transition of something inside, or of another property, is not it.
    fireEvent.transitionEnd(within(sheet).getByText('Choose a section'), {
      propertyName: 'transform',
    });
    fireEvent.transitionEnd(sheet, { propertyName: 'opacity' });
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();

    fireEvent.transitionEnd(sheet, { propertyName: 'transform' });
    expect(
      screen.queryByRole('dialog', { hidden: true }),
    ).not.toBeInTheDocument();
  });

  it('opens the search from its button and from the keyboard', () => {
    show('users');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(screen.getByRole('button', { name: 'palette open' }));
    expect(screen.queryByText('palette open')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByText('palette open')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByText('palette open')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'palette open' }));
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByText('palette open')).toBeInTheDocument();
  });

  it('opens the account menu with who is signed in and where they can go', () => {
    show('users');

    const account = screen.getByRole('button', {
      name: 'Account of Ana Staff',
    });
    expect(account).toHaveAttribute('aria-expanded', 'false');
    expect(account).toHaveClass('min-h-11', 'min-w-11');
    fireEvent.click(account);

    const menu = screen.getByRole('menu');
    expect(account).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getByText('ana@staff.test')).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Backoffice' }),
    ).toHaveAttribute('href', 'https://backoffice.circlesfera.test');
    expect(
      within(menu).getByRole('menuitem', { name: 'Back to CircleSfera' }),
    ).toHaveAttribute('href', 'https://circlesfera.test');
  });

  it('offers the Admin Panel from the Backoffice', () => {
    site.backoffice = true;
    show('plans');

    fireEvent.click(
      screen.getByRole('button', { name: 'Account of Ana Staff' }),
    );

    expect(
      screen.getByRole('menuitem', { name: 'Admin Panel' }),
    ).toHaveAttribute('href', 'https://admin.circlesfera.test');
  });

  it('closes the account menu with Escape, a press outside or its own button', () => {
    show('users');
    const account = screen.getByRole('button', {
      name: 'Account of Ana Staff',
    });

    fireEvent.click(account);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(account);
    fireEvent.pointerDown(screen.getByText('section content'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(account);
    fireEvent.click(account);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('signs out and leaves for the sign-in page', async () => {
    const before = window.location;
    const place = { href: 'http://localhost/users' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: place,
    });
    try {
      show('users');
      fireEvent.click(
        screen.getByRole('button', { name: 'Account of Ana Staff' }),
      );

      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

      expect(logout).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(place.href).toBe('/login'));
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: before,
      });
    }
  });

  it('shows no account menu while nobody is signed in', () => {
    show('users', 'all', null);

    expect(
      screen.queryByRole('button', { name: /Account of/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('section content')).toBeInTheDocument();
  });
});
