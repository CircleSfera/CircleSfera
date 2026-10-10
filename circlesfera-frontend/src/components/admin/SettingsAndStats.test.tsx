import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import SettingsTab from './SettingsTab';
import StatsTab from './StatsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getSystemSettings: vi.fn(),
    updateSystemSettings: vi.fn(),
    getEnhancedStats: vi.fn(),
    getActivityChart: vi.fn(),
    getTopUsers: vi.fn(),
  },
}));
vi.mock('../common/SafeResponsiveContainer', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('recharts', () => ({
  AreaChart: ({ data, children }: { data: unknown[]; children: ReactNode }) => (
    <div data-testid="chart" data-days={data.length}>
      {children}
    </div>
  ),
  Area: ({ name, dataKey }: { name: string; dataKey: string }) => (
    <span data-testid={`series-${dataKey}`}>{name}</span>
  ),
  XAxis: ({ tickFormatter }: { tickFormatter: (v: string) => string }) => (
    <span data-testid="tick">{tickFormatter('2026-03-10')}</span>
  ),
  Tooltip: ({ labelFormatter }: { labelFormatter: (v: string) => string }) => (
    <span data-testid="tooltip">{labelFormatter('2026-03-10')}</span>
  ),
  YAxis: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
}));

const api = vi.mocked(adminApi);

describe('SettingsTab', () => {
  const settings = [
    { key: 'maintenance_mode', value: 'false', description: 'server text' },
    { key: 'registration_open', value: 'true', description: null },
    { key: 'support_email', value: 'help@example.com', description: 'Inbox' },
    { key: 'max_upload_mb', value: '50', description: null },
  ];
  const onToast = vi.fn();
  const save = () => screen.getByRole('button', { name: 'Save changes' });

  beforeEach(() => {
    vi.clearAllMocks();
    api.getSystemSettings.mockResolvedValue(settings as never);
    api.updateSystemSettings.mockResolvedValue({} as never);
  });

  it('shows placeholders while the settings load', () => {
    api.getSystemSettings.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(
      <SettingsTab onToast={onToast} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Global settings' }),
    ).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument();
  });

  it('says there are no settings when none are defined', async () => {
    api.getSystemSettings.mockResolvedValue([] as never);
    renderWithProviders(<SettingsTab onToast={onToast} />);

    expect(await screen.findByText('No settings')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument();
  });

  it('names known settings in words and unknown ones by their key', async () => {
    renderWithProviders(<SettingsTab onToast={onToast} />);

    const maintenance = await screen.findByRole('button', {
      name: /Maintenance mode/,
    });
    expect(maintenance).toHaveAttribute('aria-pressed', 'false');
    expect(maintenance).toHaveAccessibleName(/the consumer API returns 503/);
    expect(maintenance).toHaveClass('min-h-11', 'min-w-11');
    expect(
      screen.getByRole('button', { name: /Registration open/ }),
    ).toHaveAttribute('aria-pressed', 'true');

    const email = screen.getByRole('textbox', { name: /support_email/ });
    expect(email).toHaveValue('help@example.com');
    expect(email).toHaveAccessibleName(/Inbox/);
    expect(email).toHaveClass('min-h-12');
    expect(screen.getByRole('textbox', { name: 'max_upload_mb' })).toHaveValue(
      '50',
    );
  });

  it('lets save only while something differs from what is stored', async () => {
    renderWithProviders(<SettingsTab onToast={onToast} />);
    const maintenance = await screen.findByRole('button', {
      name: /Maintenance mode/,
    });
    expect(save()).toBeDisabled();

    fireEvent.click(maintenance);
    expect(maintenance).toHaveAttribute('aria-pressed', 'true');
    expect(save()).toBeEnabled();

    fireEvent.click(maintenance);
    expect(maintenance).toHaveAttribute('aria-pressed', 'false');
    expect(save()).toBeDisabled();

    const size = screen.getByRole('textbox', { name: 'max_upload_mb' });
    fireEvent.change(size, { target: { value: '80' } });
    expect(save()).toBeEnabled();
    fireEvent.change(size, { target: { value: '50' } });
    expect(save()).toBeDisabled();
  });

  it('sends only the settings that changed, then reads them again', async () => {
    renderWithProviders(<SettingsTab onToast={onToast} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Registration open/ }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /support_email/ }), {
      target: { value: 'care@example.com' },
    });

    fireEvent.click(save());

    await waitFor(() =>
      expect(api.updateSystemSettings).toHaveBeenCalledWith([
        { key: 'registration_open', value: 'false' },
        { key: 'support_email', value: 'care@example.com' },
      ]),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Settings saved successfully',
        'success',
      ),
    );
    expect(api.getSystemSettings).toHaveBeenCalledTimes(2);
  });

  it('holds the button while saving', async () => {
    api.updateSystemSettings.mockReturnValue(new Promise(() => {}) as never);
    renderWithProviders(<SettingsTab onToast={onToast} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Maintenance mode/ }),
    );

    fireEvent.click(save());

    const saving = await screen.findByRole('button', { name: 'Saving...' });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(api.updateSystemSettings).toHaveBeenCalledTimes(1);
  });

  it('says so when saving fails and keeps what was typed', async () => {
    api.updateSystemSettings.mockRejectedValue(new Error('no'));
    renderWithProviders(<SettingsTab onToast={onToast} />);
    const size = await screen.findByRole('textbox', { name: 'max_upload_mb' });
    fireEvent.change(size, { target: { value: '80' } });

    fireEvent.click(save());

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to save settings', 'error'),
    );
    expect(size).toHaveValue('80');
    expect(save()).toBeEnabled();
    expect(api.getSystemSettings).toHaveBeenCalledTimes(1);
  });
});

describe('StatsTab', () => {
  const stats = (over: object = {}) => ({
    users: 120,
    posts: 45,
    stories: 8,
    pendingReports: 3,
    newUsersThisWeek: 12,
    userGrowth: 12,
    newPostsThisWeek: 9,
    postGrowth: -3,
    engagement: 4.2,
    reportedContentPercent: 1.5,
    activeUsersToday: 30,
    recentActivity: [],
    ...over,
  });
  const days = [
    { date: '2026-03-09', posts: 4, users: 2, stories: 1, reports: 0 },
    { date: '2026-03-10', posts: 6, users: 3, stories: 2, reports: 1 },
  ];
  const card = (label: string) =>
    screen.getAllByText(label)[0].parentElement as HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    api.getEnhancedStats.mockResolvedValue(stats() as never);
    api.getActivityChart.mockResolvedValue({ data: days } as never);
    api.getTopUsers.mockResolvedValue({ data: [] } as never);
  });

  it('shows placeholders while the figures load', () => {
    api.getEnhancedStats.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<StatsTab />);

    expect(
      screen.getByRole('heading', { name: 'Global Statistics' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(8);
  });

  it('shows the totals, the growth and the ratios', async () => {
    renderWithProviders(<StatsTab />);

    await screen.findByText('Total Users');
    await waitFor(
      () => {
        expect(card('Total Users')).toHaveTextContent('120');
        expect(card('Posts')).toHaveTextContent('45');
        expect(card('Active Stories')).toHaveTextContent('8');
        expect(card('Pending Reports')).toHaveTextContent('3');
        expect(card('Active Users Today')).toHaveTextContent('30');
        expect(card('New This Week')).toHaveTextContent('12');
      },
      { timeout: 4000 },
    );
    expect(card('Total Users')).toHaveTextContent('+12%');
    expect(card('Posts')).toHaveTextContent('-3%');
    expect(card('Active Stories')).not.toHaveTextContent('%');
    expect(card('Engagement Ratio')).toHaveTextContent('4.2%');
    expect(card('Reported Content')).toHaveTextContent('1.5%');
  });

  it('marks growth that stood still without a sign', async () => {
    api.getEnhancedStats.mockResolvedValue(
      stats({ userGrowth: 0, postGrowth: null }) as never,
    );
    renderWithProviders(<StatsTab />);

    await screen.findByText('Total Users');
    expect(within(card('Total Users')).getByText('0%')).toBeInTheDocument();
    expect(card('Posts')).not.toHaveTextContent('%');
  });

  it('shows zeros when the figures come empty', async () => {
    api.getEnhancedStats.mockResolvedValue({} as never);
    renderWithProviders(<StatsTab />);

    await screen.findByText('Total Users');
    expect(card('Total Users')).toHaveTextContent('0');
    expect(card('Engagement Ratio')).toHaveTextContent('0%');
    expect(screen.queryByText('Recent Admin Activity')).not.toBeInTheDocument();
  });

  it('draws posts and new users per day, dated by month and day', async () => {
    renderWithProviders(<StatsTab />);

    const chart = await screen.findByTestId('chart');
    expect(chart).toHaveAttribute('data-days', '2');
    expect(screen.getByTestId('series-posts')).toHaveTextContent('Posts');
    expect(screen.getByTestId('series-users')).toHaveTextContent('New users');
    expect(screen.getByTestId('tick')).toHaveTextContent('03-10');
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Date: 2026-03-10');
    expect(screen.queryByText('No activity data')).not.toBeInTheDocument();
  });

  it('says there is no activity or ranking when neither has data', async () => {
    api.getActivityChart.mockResolvedValue({ data: [] } as never);
    renderWithProviders(<StatsTab />);

    expect(await screen.findByText('No activity data')).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  });

  it('ranks the people with most engagement', async () => {
    api.getTopUsers.mockResolvedValue({
      data: [
        {
          id: 'u1',
          username: 'ana',
          avatar: null,
          fullName: 'Ana',
          totalLikes: 70,
          totalComments: 20,
          engagement: 90,
        },
        {
          id: 'u2',
          username: 'ben',
          avatar: null,
          fullName: null,
          totalLikes: 5,
          totalComments: 6,
          engagement: 11,
        },
      ],
    } as never);
    renderWithProviders(<StatsTab />);

    const first = (await screen.findByText('@ana')).closest(
      '.relative',
    ) as HTMLElement;
    expect(within(first).getByText('#1 · engagement 90')).toBeInTheDocument();
    expect(within(first).getByText('70')).toBeInTheDocument();
    expect(within(first).getByText('20')).toBeInTheDocument();
    const second = screen.getByText('@ben').closest('.relative') as HTMLElement;
    expect(within(second).getByText('#2 · engagement 11')).toBeInTheDocument();
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
  });

  it('tells what staff did lately in words, not in action codes', async () => {
    api.getEnhancedStats.mockResolvedValue(
      stats({
        recentActivity: [
          {
            id: 'l1',
            action: 'BAN_USER',
            targetType: 'user',
            targetId: '0123456789abcdef',
            details: '',
            createdAt: '2026-03-10T11:00:00Z',
            adminUsername: 'Ana',
          },
          {
            id: 'l2',
            action: 'SOMETHING_NEW',
            targetType: 'post',
            targetId: 'abc',
            details: '',
            createdAt: '2026-03-10T10:00:00Z',
            adminUsername: 'ben@staff.test',
          },
        ],
      }) as never,
    );
    renderWithProviders(<StatsTab />);

    await screen.findByText('Recent Admin Activity');
    const banned = screen.getByText('Banned user').closest('.flex-col');
    expect(banned).toHaveTextContent('Ana Banned user');
    expect(banned).toHaveTextContent('user · 01234567...');
    expect(screen.queryByText('BAN_USER')).not.toBeInTheDocument();

    const other = screen.getByText('something new').closest('.flex-col');
    // Staff are listed by name or email: neither is a handle.
    expect(other).toHaveTextContent('ben@staff.test something new');
    expect(other).not.toHaveTextContent('@ben@staff.test');
    expect(other).toHaveTextContent('post · abc...');
  });

  it('names the staff actions in Spanish too', async () => {
    api.getEnhancedStats.mockResolvedValue(
      stats({
        recentActivity: [
          {
            id: 'l1',
            action: 'DELETE_POST',
            targetType: 'post',
            targetId: 'p1',
            details: '',
            createdAt: '2026-03-10T11:00:00Z',
            adminUsername: 'Ana',
          },
        ],
      }) as never,
    );
    renderWithProviders(<StatsTab />, { lng: 'es' });

    expect(await screen.findByText('Eliminó publicación')).toBeInTheDocument();
    expect(screen.queryByText('DELETE_POST')).not.toBeInTheDocument();
  });
});
