import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import AuditLogTab from './AuditLogTab';
import HashtagsTab from './HashtagsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: { getHashtags: vi.fn(), getAuditLogs: vi.fn() },
}));
// The search waits a moment before asking; here it asks at once.
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

const page = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length ? totalPages * 20 : 0,
      page: pageNumber,
      limit: 20,
      totalPages,
    },
  },
});

beforeEach(() => vi.clearAllMocks());

describe('HashtagsTab', () => {
  const tags = [
    {
      id: 'h1',
      tag: 'sunset',
      postCount: 120,
      createdAt: '2026-03-01T10:00:00Z',
    },
    {
      id: 'h2',
      tag: 'coffee',
      postCount: 45,
      createdAt: '2026-03-02T10:00:00Z',
    },
  ];

  it('lists the hashtags with how many posts use each, numbered from the first', async () => {
    vi.mocked(adminApi.getHashtags).mockResolvedValue(page(tags) as never);
    renderWithProviders(<HashtagsTab />);

    const table = await screen.findByRole('table');
    expect(adminApi.getHashtags).toHaveBeenCalledWith(1, 20, undefined);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .slice(0, 3)
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ['1', 'sunset', '120'],
      ['2', 'coffee', '45'],
    ]);
    expect(screen.getByText('120 posts')).toBeInTheDocument();
  });

  it('searches as it is typed, from the first page, and numbers the next page on', async () => {
    vi.mocked(adminApi.getHashtags).mockImplementation(
      (pageNumber = 1) =>
        Promise.resolve(page(tags, pageNumber as number, 3)) as never,
    );
    const { i18n } = renderWithProviders(<HashtagsTab />);
    await screen.findByRole('table');

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.table.next_page') }),
    );
    await waitFor(() =>
      expect(adminApi.getHashtags).toHaveBeenLastCalledWith(2, 20, undefined),
    );
    expect(await screen.findByRole('cell', { name: '21' })).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search hashtags...' }),
      {
        target: { value: 'sun' },
      },
    );
    await waitFor(() =>
      expect(adminApi.getHashtags).toHaveBeenLastCalledWith(1, 20, 'sun'),
    );
  });

  it('says there are no hashtags', async () => {
    vi.mocked(adminApi.getHashtags).mockResolvedValue(page([]) as never);
    renderWithProviders(<HashtagsTab />);

    expect(await screen.findByText('No hashtags')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('AuditLogTab', () => {
  const logs = [
    {
      id: 'a1',
      action: 'BAN_USER',
      adminUsername: 'root',
      targetType: 'USER',
      targetId: 'user-123',
      details: 'spam ring',
      createdAt: '2026-03-01T10:00:00Z',
    },
    {
      id: 'a2',
      action: 'SOMETHING_NEW',
      adminUsername: 'ana',
      targetType: 'POST',
      targetId: 'post-9',
      details: null,
      createdAt: '2026-03-02T10:00:00Z',
    },
  ];
  const show = async (rows = logs) => {
    vi.mocked(adminApi.getAuditLogs).mockResolvedValue(page(rows) as never);
    const view = renderWithProviders(<AuditLogTab />);
    await waitFor(() => expect(adminApi.getAuditLogs).toHaveBeenCalled());
    return view;
  };

  it('lists what the staff did, who did it and to what, naming an action it does not know by its code', async () => {
    await show();

    expect(await screen.findByText('Banned user')).toBeInTheDocument();
    expect(screen.getByText('something new')).toBeInTheDocument();
    expect(screen.getByText('@root')).toBeInTheDocument();
    expect(screen.getByText('USER')).toBeInTheDocument();
    expect(adminApi.getAuditLogs).toHaveBeenCalledWith(1, 15, {
      action: undefined,
      search: undefined,
    });
  });

  it('opens an entry with its details and goes back to the list', async () => {
    await show();

    fireEvent.click(await screen.findByRole('button', { name: /Banned user/ }));

    expect(screen.getByText('user-123')).toBeInTheDocument();
    expect(screen.getByText('spam ring')).toBeInTheDocument();
    expect(screen.getByText('Target ID')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByText('user-123')).not.toBeInTheDocument();
  });

  it('shows no details block for an entry that has none', async () => {
    await show();
    fireEvent.click(
      await screen.findByRole('button', { name: /something new/ }),
    );

    expect(screen.getByText('post-9')).toBeInTheDocument();
    expect(screen.queryByText('Details')).not.toBeInTheDocument();
  });

  it('filters by action and by text, from the first page', async () => {
    await show();
    await screen.findByText('Banned user');

    fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
      target: { value: 'DELETE_POST' },
    });
    await waitFor(() =>
      expect(adminApi.getAuditLogs).toHaveBeenLastCalledWith(1, 15, {
        action: 'DELETE_POST',
        search: undefined,
      }),
    );

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Admin or target ID...' }),
      {
        target: { value: '  root ' },
      },
    );
    await waitFor(() =>
      expect(adminApi.getAuditLogs).toHaveBeenLastCalledWith(1, 15, {
        action: 'DELETE_POST',
        search: 'root',
      }),
    );
  });

  it('offers every known action in the filter, by its name', async () => {
    await show();
    const options = within(
      screen.getByRole('combobox', { name: 'Action' }),
    ).getAllByRole('option');
    expect(options[0]).toHaveTextContent('All actions');
    expect(options).toHaveLength(30);
    expect(options.map((o) => o.textContent)).toContain('Deleted post');
  });

  it('says there is nothing, and says it differently when a filter is on', async () => {
    await show([]);
    expect(await screen.findByText('No audit records')).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Admin or target ID...' }),
      {
        target: { value: 'nobody' },
      },
    );
    expect(
      await screen.findByText('No matches on this page'),
    ).toBeInTheDocument();
  });
});
