import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import SystemHealthTab from './SystemHealthTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getSystemHealth: vi.fn(),
    getWebhookEvents: vi.fn(),
    replayWebhookEvent: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const api = vi.mocked(adminApi);

const health = (over: object = {}) => ({
  timestamp: '2026-03-10T12:00:00Z',
  database: { status: 'ONLINE', latencyMs: 12 },
  queues: {
    ai: { wait: 3, active: 1, failed: 0, completed: 480 },
    analytics: { wait: 7, active: 2, failed: 0, completed: 950 },
  },
  webhooks: { processed24h: 98, failed24h: 2 },
  ...over,
});

const event = (id: string, status: string, over: object = {}) => ({
  id,
  provider: 'stripe',
  externalId: `evt_${id}`,
  status,
  createdAt: '2026-03-10T11:00:00Z',
  updatedAt: '2026-03-10T11:00:00Z',
  processedAt: null,
  ...over,
});

const events = (rows: object[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: { total: rows.length, page: pageNumber, limit: 20, totalPages },
  },
});

/** The row of one webhook event, found by its external id. */
const row = (id: string) =>
  screen.getAllByText(`evt_${id}`)[0].closest('.p-3\\.5') as HTMLElement;

/** The cell of one figure inside a section, found by the section title. */
const figure = (section: string, label: string) => {
  const card = screen
    .getByRole('heading', { name: section })
    .closest('section') as HTMLElement;
  return within(card).getByText(label).parentElement as HTMLElement;
};

describe('SystemHealthTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSystemHealth.mockResolvedValue(health() as never);
    api.getWebhookEvents.mockResolvedValue(events([]) as never);
    api.replayWebhookEvent.mockResolvedValue({} as never);
  });

  it('shows placeholders while the first reading is on its way', () => {
    api.getSystemHealth.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<SystemHealthTab />);

    expect(
      screen.getByRole('heading', { name: 'System Status' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse .h-24')).toHaveLength(3);
    expect(screen.queryByText('Database')).not.toBeInTheDocument();
  });

  it('says monitoring is unreachable and reads again on retry', async () => {
    api.getSystemHealth.mockRejectedValueOnce(new Error('down'));
    renderWithProviders(<SystemHealthTab />);

    expect(
      await screen.findByText('Critical Monitoring Error'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry Connection' }));

    expect(await screen.findByText('Database')).toBeInTheDocument();
    expect(api.getSystemHealth).toHaveBeenCalledTimes(2);
  });

  it('shows the database, both queues and the payment webhooks', async () => {
    renderWithProviders(<SystemHealthTab />);

    await screen.findByText('Database');
    expect(figure('Database', 'Status')).toHaveTextContent('ONLINE');
    expect(figure('Database', 'Raw Latency')).toHaveTextContent('12 ms');

    expect(figure('AI Queue', 'Waiting')).toHaveTextContent('3');
    expect(figure('AI Queue', 'Failed')).toHaveTextContent('0');
    expect(figure('AI Queue', 'Completed')).toHaveTextContent('480');
    expect(figure('AI Queue', 'Active')).toHaveTextContent('1');

    expect(figure('Analytics Queue', 'Waiting')).toHaveTextContent('7');
    expect(figure('Analytics Queue', 'Completed')).toHaveTextContent('950');
    expect(figure('Analytics Queue', 'Active')).toHaveTextContent('2');

    expect(
      figure('Stripe Webhooks', 'Processed Successfully'),
    ).toHaveTextContent('98');
    expect(figure('Stripe Webhooks', 'Failed Webhooks')).toHaveTextContent('2');
    expect(figure('Stripe Webhooks', 'Success Rate')).toHaveTextContent(
      '98.0%',
    );
    expect(screen.getByText(/· \d+s ago/)).toBeInTheDocument();
  });

  it.each([
    ['online and fast', { status: 'ONLINE', latencyMs: 149 }, true],
    ['online but slow', { status: 'ONLINE', latencyMs: 150 }, false],
    ['offline', { status: 'OFFLINE', latencyMs: 5 }, false],
  ])('marks the database %s accordingly', async (_case, database, healthy) => {
    api.getSystemHealth.mockResolvedValue(health({ database }) as never);
    renderWithProviders(<SystemHealthTab />);

    await screen.findByText('Database');
    const status = within(figure('Database', 'Status')).getByText(
      database.status,
    );
    expect(status).toHaveClass(healthy ? 'text-emerald-400' : 'text-red-400');
  });

  it.each([
    ['nothing arrived', { processed24h: 0, failed24h: 0 }, '100.0%', true],
    [
      'almost all went through',
      { processed24h: 96, failed24h: 4 },
      '96.0%',
      true,
    ],
    ['too many failed', { processed24h: 95, failed24h: 5 }, '95.0%', false],
    ['all failed', { processed24h: 0, failed24h: 3 }, '0.0%', false],
  ])(
    'works out the webhook success rate when %s',
    async (_case, webhooks, rate, good) => {
      api.getSystemHealth.mockResolvedValue(health({ webhooks }) as never);
      renderWithProviders(<SystemHealthTab />);

      await screen.findByText('Database');
      const cell = figure('Stripe Webhooks', 'Success Rate');
      expect(cell).toHaveTextContent(rate);
      const bar = cell.querySelector('.h-full') as HTMLElement;
      expect(bar).toHaveClass(good ? 'bg-emerald-400' : 'bg-red-400');
      expect(bar.style.width).toBe(`${Number.parseFloat(rate)}%`);
    },
  );

  it('colours a queue as a warning when it has failures or a backlog', async () => {
    api.getSystemHealth.mockResolvedValue(
      health({
        queues: {
          ai: { wait: 50, active: 0, failed: 0, completed: 1 },
          analytics: { wait: 0, active: 0, failed: 1, completed: 1 },
        },
      }) as never,
    );
    renderWithProviders(<SystemHealthTab />);

    await screen.findByText('Database');
    for (const title of ['AI Queue', 'Analytics Queue']) {
      const head = screen.getByRole('heading', { name: title }).parentElement
        ?.parentElement as HTMLElement;
      expect(head.querySelector('svg')).toHaveClass('text-amber-400');
    }
  });

  it('counts the seconds since the last reading', async () => {
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('Database');
    expect(screen.getByText('· 0s ago')).toBeInTheDocument();

    // A busy machine may skip a tick: any later second proves the count.
    expect(
      await screen.findByText(/^· [1-9]\d*s ago$/, undefined, {
        timeout: 5000,
      }),
    ).toBeInTheDocument();
  });

  it('reads the health again from the refresh button', async () => {
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('Database');

    fireEvent.click(screen.getByRole('button', { name: 'Retry Connection' }));

    await waitFor(() => expect(api.getSystemHealth).toHaveBeenCalledTimes(2));
  });

  it('lists the failed events first and says when there are none', async () => {
    renderWithProviders(<SystemHealthTab />);

    expect(await screen.findByText('No webhook events')).toBeInTheDocument();
    expect(api.getWebhookEvents).toHaveBeenCalledWith(1, 20, 'FAILED');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
      'FAILED',
    );
  });

  it('asks for pending or every event when the filter changes', async () => {
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('No webhook events');

    const filter = screen.getByRole('combobox', { name: 'Status' });
    fireEvent.change(filter, { target: { value: 'PENDING' } });
    await waitFor(() =>
      expect(api.getWebhookEvents).toHaveBeenLastCalledWith(1, 20, 'PENDING'),
    );

    fireEvent.change(filter, { target: { value: '' } });
    await waitFor(() =>
      expect(api.getWebhookEvents).toHaveBeenLastCalledWith(1, 20, undefined),
    );
  });

  it('offers a retry for failed and pending events, not for processed ones', async () => {
    api.getWebhookEvents.mockResolvedValue(
      events([
        event('a', 'FAILED'),
        event('b', 'PENDING'),
        event('c', 'PROCESSED'),
      ]) as never,
    );
    renderWithProviders(<SystemHealthTab />);

    await screen.findByText('evt_a');
    expect(
      within(row('a')).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
    expect(
      within(row('b')).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
    expect(
      within(row('c')).queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();

    expect(within(row('a')).getByText('FAILED')).toHaveClass('text-red-400');
    expect(within(row('b')).getByText('PENDING')).toHaveClass(
      'text-yellow-500',
    );
    expect(within(row('c')).getByText('PROCESSED')).toHaveClass(
      'text-green-500',
    );
  });

  it('replays an event and reads the list and the health again', async () => {
    api.getWebhookEvents.mockResolvedValue(
      events([event('a', 'FAILED')]) as never,
    );
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('evt_a');

    fireEvent.click(within(row('a')).getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(api.replayWebhookEvent).toHaveBeenCalledWith('a'),
    );
    await waitFor(() => {
      expect(api.getWebhookEvents).toHaveBeenCalledTimes(2);
      expect(api.getSystemHealth).toHaveBeenCalledTimes(2);
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps only the replayed event busy and holds the others meanwhile', async () => {
    let finish: (value: unknown) => void = () => {};
    api.replayWebhookEvent.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    api.getWebhookEvents.mockResolvedValue(
      events([event('a', 'FAILED'), event('b', 'FAILED')]) as never,
    );
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('evt_a');

    fireEvent.click(within(row('a')).getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(
        within(row('a')).getByRole('button', { name: 'Retry' }),
      ).toHaveAttribute('aria-busy', 'true'),
    );
    const other = within(row('b')).getByRole('button', { name: 'Retry' });
    expect(other).toBeDisabled();
    expect(other).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(other);
    expect(api.replayWebhookEvent).toHaveBeenCalledTimes(1);

    finish({});
    await waitFor(() =>
      expect(
        within(row('b')).getByRole('button', { name: 'Retry' }),
      ).toBeEnabled(),
    );
  });

  it('says so when an event could not be replayed', async () => {
    api.replayWebhookEvent.mockRejectedValue(new Error('no'));
    api.getWebhookEvents.mockResolvedValue(
      events([event('a', 'FAILED')]) as never,
    );
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('evt_a');

    fireEvent.click(within(row('a')).getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The event could not be replayed',
      ),
    );
    expect(api.getWebhookEvents).toHaveBeenCalledTimes(1);
  });

  it('opens one event at a time with its details', async () => {
    api.getWebhookEvents.mockResolvedValue(
      events([
        event('a', 'FAILED'),
        event('c', 'PROCESSED', { processedAt: '2026-03-10T11:05:00Z' }),
      ]) as never,
    );
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('evt_a');

    fireEvent.click(within(row('a')).getByRole('button', { name: 'Expand' }));
    expect(within(row('a')).getByText('External ID')).toBeInTheDocument();
    expect(within(row('a')).getAllByText('evt_a')).toHaveLength(2);
    expect(within(row('a')).queryByText(/Processed:/)).not.toBeInTheDocument();

    fireEvent.click(within(row('c')).getByRole('button', { name: 'Expand' }));
    expect(within(row('c')).getByText(/Processed:/)).toBeInTheDocument();
    expect(within(row('a')).queryByText('External ID')).not.toBeInTheDocument();

    fireEvent.click(within(row('c')).getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByText('External ID')).not.toBeInTheDocument();
  });

  it('pages through the events and goes back to the first page on a new filter', async () => {
    api.getWebhookEvents.mockImplementation((pageNumber = 1) =>
      Promise.resolve(
        events([event(`p${pageNumber}`, 'FAILED')], pageNumber, 3) as never,
      ),
    );
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('evt_p1');

    fireEvent.click(within(row('p1')).getByRole('button', { name: 'Expand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('evt_p2')).toBeInTheDocument();
    expect(api.getWebhookEvents).toHaveBeenLastCalledWith(2, 20, 'FAILED');

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'PENDING' },
    });
    await waitFor(() =>
      expect(api.getWebhookEvents).toHaveBeenLastCalledWith(1, 20, 'PENDING'),
    );
    expect(screen.queryByText('External ID')).not.toBeInTheDocument();
  });

  it('shows no page controls for a single page of events', async () => {
    api.getWebhookEvents.mockResolvedValue(
      events([event('a', 'FAILED')]) as never,
    );
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('evt_a');

    expect(
      screen.queryByRole('button', { name: 'Next page' }),
    ).not.toBeInTheDocument();
  });

  it('gives the event controls a finger-sized target', async () => {
    api.getWebhookEvents.mockResolvedValue(
      events([event('a', 'FAILED')]) as never,
    );
    renderWithProviders(<SystemHealthTab />);
    await screen.findByText('evt_a');

    expect(within(row('a')).getByRole('button', { name: 'Retry' })).toHaveClass(
      'min-h-11',
    );
    expect(
      within(row('a')).getByRole('button', { name: 'Expand' }),
    ).toHaveClass('min-h-11', 'min-w-11');
  });
});
