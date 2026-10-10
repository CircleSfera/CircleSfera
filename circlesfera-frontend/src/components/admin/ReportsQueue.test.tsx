import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import ReportsTab from './ReportsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getReports: vi.fn(),
    getUserDetail: vi.fn(),
    updateReport: vi.fn(),
    claimReport: vi.fn(),
    unclaimReport: vi.fn(),
    reassignReport: vi.fn(),
    resolveReportWithPenalty: vi.fn(),
    bulkUpdateReports: vi.fn(),
    deletePost: vi.fn(),
    deleteStory: vi.fn(),
    deleteComment: vi.fn(),
  },
}));
const staff = { id: 'admin-1' as string | undefined };
vi.mock('../../stores/adminAuthStore', () => ({
  useAdminAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ admin: staff.id ? { id: staff.id } : null }),
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('../../utils/adminPanel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/adminPanel')>()),
  platformOrigin: () => 'https://platform.test',
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();
const NOW = new Date('2026-03-10T12:00:00Z');
const ago = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();

const report = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  reason: 'SPAM',
  details: null,
  status: 'PENDING',
  targetType: 'POST',
  targetId: `target-${id}`,
  createdAt: ago(5),
  assignedAdminId: null,
  targetContent: { author: `author_${id}`, text: `Text ${id}` },
  ...over,
});
const list = (rows: unknown[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 10,
      totalPages,
    },
  },
});

function Where() {
  const location = useLocation();
  return (
    <output data-testid="where">{location.pathname + location.search}</output>
  );
}
const show = (route = '/reports') =>
  renderWithProviders(
    <>
      <ReportsTab onToast={onToast} />
      <Where />
    </>,
    { routerProps: { useTransitions: false, initialEntries: [route] } },
  );
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });
const dialog = () => screen.getByRole('dialog');
const open = async (id: string) => {
  fireEvent.click(await waitFor(() => rowOf(`@author_${id}`)));
  await within(detail()).findByText(`ID: ${id}`);
  return detail();
};
const line = (label: string) =>
  within(detail()).getByText(label, { selector: 'dt' })
    .parentElement as HTMLElement;
const lastQuery = () => api.getReports.mock.calls.at(-1);

describe('ReportsTab, the rest of the queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    staff.id = 'admin-1';
    api.getReports.mockResolvedValue(list([report('1')]) as never);
    api.getUserDetail.mockResolvedValue({
      data: { profile: { username: 'ana' } },
    } as never);
    for (const call of [
      api.updateReport,
      api.claimReport,
      api.unclaimReport,
      api.reassignReport,
      api.resolveReportWithPenalty,
      api.bulkUpdateReports,
      api.deletePost,
      api.deleteStory,
      api.deleteComment,
    ]) {
      call.mockResolvedValue({} as never);
    }
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('says how long ago each report came in', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', { createdAt: ago(0) }),
        report('2', { createdAt: ago(12) }),
        report('3', { createdAt: ago(60 * 5) }),
        report('4', { createdAt: ago(60 * 24 * 3) }),
        report('5', { createdAt: ago(60 * 24 * 30) }),
        report('6', { createdAt: ago(-10) }),
      ]) as never,
    );
    show();

    expect(
      within(await waitFor(() => rowOf('@author_1'))).getByText('now'),
    ).toBeTruthy();
    expect(within(rowOf('@author_2')).getByText('12m ago')).toBeTruthy();
    expect(within(rowOf('@author_3')).getByText('5h ago')).toBeTruthy();
    expect(within(rowOf('@author_4')).getByText('3d ago')).toBeTruthy();
    expect(rowOf('@author_5').textContent).toMatch(/2026/);
    // A clock a little ahead of the server's does not show a negative time.
    expect(within(rowOf('@author_6')).getByText('now')).toBeTruthy();
  });

  it('shows on each row who has it, when it was closed and its picture', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', {
          assignedAdminId: 'admin-22222222',
          assignedAdmin: {
            id: 'a',
            email: 'eva@staff.test',
            displayName: 'Eva',
          },
          resolvedAt: ago(60),
          targetContent: {
            author: 'author_1',
            thumbnail: 'https://cdn.test/1.jpg',
          },
        }),
        report('2', {
          assignedAdminId: 'admin-22222222',
          assignedAdmin: { id: 'a', email: 'eva@staff.test', displayName: '' },
        }),
        report('3', { assignedAdminId: 'admin-22222222' }),
        report('4', { targetContent: null }),
      ]) as never,
    );
    show();

    const first = await waitFor(() => rowOf('@author_1'));
    expect(within(first).getByText('Assigned: @Eva')).toBeTruthy();
    expect(within(first).getByText(/^Resolved /)).toBeTruthy();
    expect(first.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.test/1.jpg',
    );
    expect(
      within(rowOf('@author_2')).getByText('Assigned: @eva@staff.test'),
    ).toBeTruthy();
    expect(
      within(rowOf('@author_3')).getByText('Assigned: @admin-22'),
    ).toBeTruthy();
    expect(rowOf('@Unknown').querySelector('img')).toBeNull();
    expect(
      screen.getByRole('checkbox', {
        name: 'Select the report about @Unknown',
      }),
    ).toBeInTheDocument();
  });

  it('asks for the queue by state, search, page and "mine"', async () => {
    api.getReports.mockResolvedValue(list([report('1')], 1, 3) as never);
    show();
    await waitFor(() => rowOf('@author_1'));

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastQuery()?.[0]).toBe(2));

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'RESOLVED' },
    });
    await waitFor(() =>
      expect(lastQuery()).toEqual([
        1,
        10,
        undefined,
        'RESOLVED',
        undefined,
        undefined,
      ]),
    );

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search reports...' }),
      { target: { value: 'scam' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'My queue' }));
    await waitFor(() =>
      expect(lastQuery()).toEqual([
        1,
        10,
        'scam',
        'RESOLVED',
        undefined,
        'admin-1',
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'My queue' }));
    await waitFor(() => expect(lastQuery()?.[5]).toBeUndefined());
  });

  it('offers to clear the filters when they leave the queue empty', async () => {
    api.getReports.mockResolvedValue(list([]) as never);
    show();
    expect(
      await screen.findByText('No reports in the queue'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search reports...' }),
      { target: { value: 'scam' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'My queue' }));
    expect(
      await screen.findByText('No reports match these filters'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() =>
      expect(lastQuery()).toEqual([
        1,
        10,
        undefined,
        'PENDING',
        undefined,
        undefined,
      ]),
    );
    expect(
      await screen.findByText('No reports in the queue'),
    ).toBeInTheDocument();
  });

  it('shows every state of one account when opened from its record, and leaves it on clearing', async () => {
    api.getReports.mockResolvedValue(list([]) as never);
    show('/reports?userId=u-9');

    await waitFor(() =>
      expect(lastQuery()).toEqual([
        1,
        10,
        undefined,
        undefined,
        'u-9',
        undefined,
      ]),
    );
    expect(await screen.findByText(/@ana/)).toBeInTheDocument();
    expect(
      await screen.findByText('No reports match these filters'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/reports'),
    );
    await waitFor(() =>
      expect(lastQuery()).toEqual([
        1,
        10,
        undefined,
        'PENDING',
        undefined,
        undefined,
      ]),
    );
  });

  it('opens the reported post on the platform, in another tab', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    show();
    const pane = await open('1');

    fireEvent.click(
      within(pane).getByRole('button', { name: 'View Original' }),
    );
    expect(opened).toHaveBeenCalledWith(
      'https://platform.test/p/target-1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(
      within(pane).queryByRole('button', { name: 'Open in Users' }),
    ).toBeNull();
  });

  it('opens a reported account on the platform, or its record in Users', async () => {
    api.getReports.mockResolvedValue(
      list([report('1', { targetType: 'USER', targetId: 'u 7' })]) as never,
    );
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    show();
    const pane = await open('1');

    expect(within(pane).getByText('Reported user')).toBeInTheDocument();
    fireEvent.click(
      within(pane).getByRole('button', { name: 'View Original' }),
    );
    expect(opened).toHaveBeenCalledWith(
      'https://platform.test/author_1',
      '_blank',
      'noopener,noreferrer',
    );

    fireEvent.click(
      within(pane).getByRole('button', { name: 'Open in Users' }),
    );
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/users?userId=u%207',
    );
  });

  it.each([['STORY'], ['COMMENT'], ['MESSAGE']])(
    'offers no original for a reported %s, which has no page of its own',
    async (targetType) => {
      api.getReports.mockResolvedValue(
        list([report('1', { targetType })]) as never,
      );
      show();
      const pane = await open('1');

      expect(
        within(pane).queryByRole('button', { name: 'View Original' }),
      ).toBeNull();
    },
  );

  it('offers no original for an account whose name is not known', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', { targetType: 'USER', targetContent: { text: 'x' } }),
      ]) as never,
    );
    show();
    fireEvent.click(await waitFor(() => rowOf('@Unknown')));

    await within(detail()).findByText('ID: 1');
    expect(
      within(detail()).queryByRole('button', { name: 'View Original' }),
    ).toBeNull();
    expect(
      within(detail()).getByRole('button', { name: 'Open in Users' }),
    ).toBeInTheDocument();
  });

  it('shows a reported message with its author, text and picture', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', {
          targetType: 'MESSAGE',
          targetContent: {
            author: 'author_1',
            text: 'Send me money',
            thumbnail: 'https://cdn.test/a.jpg',
          },
        }),
      ]) as never,
    );
    show();
    const pane = await open('1');

    expect(within(pane).getByText('Reported message')).toBeInTheDocument();
    expect(within(pane).getByText('Send me money')).toBeInTheDocument();
    expect(
      pane.querySelector('img[src="https://cdn.test/a.jpg"]'),
    ).toBeTruthy();
  });

  it('shows reported content with its picture, or says there is none', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', {
          targetContent: {
            author: 'author_1',
            text: 'Buy followers',
            thumbnail: 'https://cdn.test/p.jpg',
          },
        }),
        report('2', { targetContent: { author: 'author_2' } }),
      ]) as never,
    );
    show();

    const pane = await open('1');
    expect(within(pane).getByAltText('Reported content')).toHaveAttribute(
      'src',
      'https://cdn.test/p.jpg',
    );
    expect(within(pane).getByText(/Buy followers/)).toBeInTheDocument();

    await open('2');
    expect(within(detail()).getByText('No visual preview')).toBeInTheDocument();
  });

  it('shows who reported, the details, the state, who has it and when it closed', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', {
          status: 'RESOLVED',
          details: 'Third time this week',
          reporter: { profile: { username: 'witness', avatar: null } },
          assignedAdminId: 'admin-22222222',
          resolvedAt: '2026-03-09T09:00:00Z',
        }),
        report('2', {
          status: 'REVIEWING',
          details: '[AI Automated Flag]: Looks like spam',
          assignedAdminId: 'admin-22222222',
          assignedAdmin: {
            id: 'a',
            email: 'eva@staff.test',
            displayName: 'Eva',
          },
        }),
        report('3', { status: 'REJECTED' }),
      ]) as never,
    );
    show();

    await open('1');
    expect(within(line('Reported by')).getByText('@witness')).toBeTruthy();
    expect(
      within(detail()).getByText('Third time this week'),
    ).toBeInTheDocument();
    expect(within(line('Current Status')).getByText('RESOLVED')).toHaveClass(
      'text-green-400',
    );
    expect(within(line('Assigned to')).getByText('admin-22')).toBeTruthy();
    expect(line('Resolved at').textContent).toMatch(/2026/);
    // A closed report offers no decision.
    expect(
      within(detail()).queryByRole('button', { name: 'Ignore' }),
    ).toBeNull();

    await open('2');
    expect(
      within(line('Reported by')).getByText('AI System (Auto-Moderation)'),
    ).toBeTruthy();
    expect(within(detail()).getByText('Looks like spam')).toBeInTheDocument();
    expect(within(line('Current Status')).getByText('REVIEWING')).toHaveClass(
      'text-blue-400',
    );
    expect(within(line('Assigned to')).getByText('Eva')).toBeTruthy();

    await open('3');
    expect(within(line('Reported by')).getByText('@Anonymous')).toBeTruthy();
    expect(within(line('Current Status')).getByText('REJECTED')).toHaveClass(
      'text-white/70',
    );
    expect(within(detail()).queryByText('Assigned to')).toBeNull();
    expect(within(detail()).queryByText('Additional Details')).toBeNull();
  });

  it('lets go of a report the operator holds', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', { status: 'REVIEWING', assignedAdminId: 'admin-1' }),
      ]) as never,
    );
    show();
    const pane = await open('1');

    expect(within(pane).queryByRole('button', { name: 'Claim' })).toBeNull();
    expect(
      within(pane).queryByRole('button', { name: 'Take over' }),
    ).toBeNull();
    fireEvent.click(within(pane).getByRole('button', { name: 'Unclaim' }));
    await waitFor(() => expect(api.unclaimReport).toHaveBeenCalledWith('1'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Report unclaimed', 'success'),
    );

    api.unclaimReport.mockRejectedValue(new Error('no'));
    fireEvent.click(within(pane).getByRole('button', { name: 'Unclaim' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Could not unclaim report', 'error'),
    );
  });

  it('takes over a report another operator holds', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', { status: 'REVIEWING', assignedAdminId: 'admin-2' }),
      ]) as never,
    );
    show();
    const pane = await open('1');

    expect(within(pane).queryByRole('button', { name: 'Unclaim' })).toBeNull();
    fireEvent.click(within(pane).getByRole('button', { name: 'Take over' }));
    await waitFor(() =>
      expect(api.reassignReport).toHaveBeenCalledWith('1', 'admin-1'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Report reassigned', 'success'),
    );

    api.reassignReport.mockRejectedValue(new Error('no'));
    fireEvent.click(within(pane).getByRole('button', { name: 'Take over' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Could not reassign report',
        'error',
      ),
    );
  });

  it('offers neither to let go nor to take over while the operator is not known', async () => {
    staff.id = undefined;
    api.getReports.mockResolvedValue(
      list([
        report('1', { status: 'REVIEWING', assignedAdminId: 'admin-2' }),
      ]) as never,
    );
    show();
    const pane = await open('1');

    expect(within(pane).queryByRole('button', { name: 'Unclaim' })).toBeNull();
    expect(
      within(pane).queryByRole('button', { name: 'Take over' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'My queue' }));
    await waitFor(() => expect(api.getReports).toHaveBeenCalledTimes(1));
  });

  it('dismisses an urgent account report as a false positive, and says so when a penalty fails', async () => {
    api.getReports.mockResolvedValue(
      list([
        report('1', {
          targetType: 'USER',
          details: '[URGENT] Threats in messages',
        }),
      ]) as never,
    );
    api.resolveReportWithPenalty.mockRejectedValueOnce(new Error('no'));
    show();
    const pane = await open('1');

    fireEvent.click(within(pane).getByRole('button', { name: 'Strike' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to apply penalty', 'error'),
    );
    expect(within(detail()).getByText('ID: 1')).toBeInTheDocument();

    fireEvent.click(within(pane).getByRole('button', { name: 'Ignore' }));
    await waitFor(() =>
      expect(api.resolveReportWithPenalty).toHaveBeenLastCalledWith(
        '1',
        'IGNORE',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'False positive dismissed',
        'success',
      ),
    );
    await waitFor(() =>
      expect(within(detail()).queryByText('ID: 1')).toBeNull(),
    );
  });

  it.each([
    ['POST', 'deletePost'],
    ['story', 'deleteStory'],
    ['COMMENT', 'deleteComment'],
  ] as const)(
    'deletes a reported %s after confirming, and closes the report with the notes',
    async (targetType, call) => {
      api.getReports.mockResolvedValue(
        list([
          report('1', { targetType, internalNotes: 'Seen before' }),
        ]) as never,
      );
      show();
      const pane = await open('1');

      fireEvent.click(within(pane).getByRole('button', { name: 'Delete' }));
      expect(
        within(dialog()).getByText(
          'Are you sure you want to permanently delete this content?',
        ),
      ).toBeInTheDocument();
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(api[call]).not.toHaveBeenCalled();

      fireEvent.click(within(pane).getByRole('button', { name: 'Delete' }));
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'Confirm' }),
      );

      await waitFor(() => expect(api[call]).toHaveBeenCalledWith('target-1'));
      await waitFor(() =>
        expect(api.updateReport).toHaveBeenCalledWith('1', {
          status: 'RESOLVED',
          internalNotes: 'Seen before',
        }),
      );
      expect(onToast).toHaveBeenCalledWith('Content deleted', 'success');
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith('Report updated', 'success'),
      );
    },
  );

  it('leaves the report open when the content could not be deleted', async () => {
    api.deletePost.mockRejectedValue(new Error('no'));
    show();
    const pane = await open('1');

    fireEvent.click(within(pane).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to delete', 'error'),
    );
    expect(api.updateReport).not.toHaveBeenCalled();
    expect(within(detail()).getByText('ID: 1')).toBeInTheDocument();
  });

  it('saves the notes without closing the report, and says so when it fails', async () => {
    api.getReports.mockResolvedValue(
      list([report('1', { internalNotes: 'First look' })]) as never,
    );
    show();
    const pane = await open('1');

    const notes = within(pane).getByRole('textbox', { name: 'Internal notes' });
    await waitFor(() => expect(notes).toHaveValue('First look'));
    fireEvent.change(notes, { target: { value: 'Second look' } });
    fireEvent.click(within(pane).getByRole('button', { name: 'Save notes' }));

    await waitFor(() =>
      expect(api.updateReport).toHaveBeenCalledWith('1', {
        status: 'PENDING',
        internalNotes: 'Second look',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Report updated', 'success'),
    );
    expect(within(detail()).getByText('ID: 1')).toBeInTheDocument();

    api.updateReport.mockRejectedValue(new Error('no'));
    fireEvent.click(within(pane).getByRole('button', { name: 'Save notes' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to update report', 'error'),
    );
  });

  it('dismisses several reports at once, and says so when it fails', async () => {
    api.getReports.mockResolvedValue(
      list([report('1'), report('2'), report('3')]) as never,
    );
    show();
    await waitFor(() => rowOf('@author_1'));

    const all = screen.getByRole('checkbox', { name: 'Select All' });
    fireEvent.click(all);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(all).toBeChecked();
    fireEvent.click(all);
    await waitFor(() => expect(screen.queryByText('3 selected')).toBeNull());

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select the report about @author_1',
      }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select the report about @author_3',
      }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select the report about @author_3',
      }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select the report about @author_2',
      }),
    );
    // Ticking a row does not open it.
    expect(within(detail()).queryByText(/^ID:/)).toBeNull();

    api.bulkUpdateReports.mockRejectedValueOnce(new Error('no'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss selected' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Failed to bulk update reports',
        'error',
      ),
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss selected' }));
    await waitFor(() =>
      expect(api.bulkUpdateReports).toHaveBeenLastCalledWith(
        ['1', '2'],
        'REJECTED',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('2 reports dismissed', 'success'),
    );
    await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull());
  });
});
