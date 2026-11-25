import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminApi,
  type OperationsCspSummary,
  type OperationsLives,
  type OperationsOrphanFiles,
  type OperationsResources,
  type OperationsWarehouse,
} from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import OperationsTab, { formatBytes } from './OperationsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getOperationsResources: vi.fn(),
    getOperationsWarehouse: vi.fn(),
    getOperationsCsp: vi.fn(),
    getOperationsOrphanFiles: vi.fn(),
    getOperationsLives: vi.fn(),
  },
}));

const api = vi.mocked(adminApi);
const GIB = 1024 ** 3;

const resources = (
  over: Partial<OperationsResources> = {},
): OperationsResources => ({
  generatedAt: '2026-11-25T10:00:00.000Z',
  host: {
    memoryTotalBytes: 8 * GIB,
    memoryAvailableBytes: 5 * GIB,
    loadAverage: [0.42, 0.5, 0.61],
    cpus: 4,
  },
  container: { memoryBytes: 512 * 1024 ** 2, memoryLimitBytes: null },
  process: {
    heapUsedBytes: 300 * 1024 ** 2,
    rssBytes: 600 * 1024 ** 2,
    heapAlertBytes: GIB,
    rssAlertBytes: GIB,
  },
  disks: {
    alertRatio: 0.9,
    root: { totalBytes: 100 * GIB, freeBytes: 40 * GIB, usedRatio: 0.6 },
    uploads: null,
  },
  database: { reachable: true, sizeBytes: 2 * GIB },
  redis: {
    reachable: true,
    usedMemoryBytes: 64 * 1024 ** 2,
    peakMemoryBytes: 80 * 1024 ** 2,
    maxMemoryBytes: 0,
    evictedKeys: 0,
  },
  queues: [
    {
      name: 'video-transcoding',
      reachable: true,
      waiting: 3,
      active: 1,
      delayed: 0,
      failed: 2,
    },
    {
      name: 'feed-fanout',
      reachable: false,
      waiting: null,
      active: null,
      delayed: null,
      failed: null,
    },
  ],
  notVisible: ['per_container_usage', 'docker_disk_usage', 'other_volumes'],
  ...over,
});

const warehouse = (
  over: Partial<OperationsWarehouse> = {},
): OperationsWarehouse => ({
  generatedAt: '2026-11-25T10:00:00.000Z',
  configured: true,
  tables: [
    {
      name: 'transactions',
      rows: 1234,
      bytes: 2 * 1024 ** 2,
      newestRowAt: '2026-11-24 03:30:00',
      newestRowUnknown: false,
    },
    {
      name: 'appeals',
      rows: 0,
      bytes: 0,
      newestRowAt: null,
      newestRowUnknown: false,
    },
    {
      name: 'reports',
      rows: 9,
      bytes: 1024,
      newestRowAt: null,
      newestRowUnknown: true,
    },
  ],
  readError: null,
  exportFolder: 'writable',
  recentExports: [
    { name: '2026-11-24T03-30-00', rows: { reports: 5, transactions: 12 } },
  ],
  job: { completed: 30, failed: 1, scheduled: 1, lastFailure: 'load_failed' },
  ...over,
});

const csp = (
  over: Partial<OperationsCspSummary> = {},
): OperationsCspSummary => ({
  days: 3,
  firstDay: '2026-11-20',
  lastDay: '2026-11-24',
  total: 17,
  rows: [
    {
      count: 12,
      disposition: 'report',
      directive: 'img-src',
      blocked: 'https://cdn.example.com',
    },
    {
      count: 5,
      disposition: 'report',
      directive: 'script-src',
      blocked: 'inline',
    },
  ],
  ...over,
});

const orphans = (
  over: Partial<OperationsOrphanFiles> = {},
): OperationsOrphanFiles => ({
  generatedAt: '2026-11-25T10:00:00.000Z',
  status: 'ok',
  policy: {
    graceHours: 168,
    deletionsPerNight: 300,
    deletedContentKeptDays: 30,
    maxShare: 0.5,
    shareWindowDays: 90,
  },
  files: { count: 900, bytes: 3 * GIB },
  foreign: 5,
  used: 845,
  orphans: { count: 40, bytes: 120 * 1024 ** 2, nights: 1 },
  nextRun: { count: 40, bytes: 120 * 1024 ** 2 },
  heldBack: null,
  keptDeleted: 6,
  unusedRecent: 4,
  breakdown: {
    age: { lt_30d: 10, ge_90d: 30 },
    size: { lt_1mb: 40 },
    extension: { jpg: 25, png: 15 },
    owner: { no_owner: 40 },
    shape: { storage_named: 40 },
  },
  record: { rows: 870, withOwner: 800, withoutOwner: 70, missingOnDisk: 3 },
  unrecordedOnDisk: 12,
  ...over,
});

const lives = (over: Partial<OperationsLives> = {}): OperationsLives => ({
  generatedAt: '2026-11-25T10:00:00.000Z',
  lives: { onAir: 4, limit: 10, withoutRoom: 1, roomsRead: true },
  recordings: { running: 1, limit: 2, enabled: true },
  ...over,
});

const section = (title: string) =>
  screen
    .getByRole('heading', { name: title })
    .closest('section') as HTMLElement;

/** The figure under one label inside a section. */
const metric = (title: string, label: string) =>
  within(section(title)).getByText(label).parentElement as HTMLElement;

describe('OperationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOperationsResources.mockResolvedValue(resources());
    api.getOperationsWarehouse.mockResolvedValue(warehouse());
    api.getOperationsCsp.mockResolvedValue(csp());
    api.getOperationsOrphanFiles.mockResolvedValue(orphans());
    api.getOperationsLives.mockResolvedValue(lives());
  });

  describe('lives (PD-092)', () => {
    it('shows lives on air and recordings against their limits, and the lives left without a room', async () => {
      renderWithProviders(<OperationsTab />);

      await screen.findByText('4 of 10');
      expect(
        within(metric('Lives', 'Lives on air')).getByText('4 of 10'),
      ).toBeInTheDocument();
      expect(
        within(metric('Lives', 'Lives on air')).getByText(
          /1 more marked on air with no room/,
        ),
      ).toBeInTheDocument();
      expect(
        within(metric('Lives', 'Being recorded')).getByText('1 of 2'),
      ).toBeInTheDocument();
    });

    it('marks a limit reached, and says when the rooms could not be read or nothing is recorded', async () => {
      api.getOperationsLives.mockResolvedValue(
        lives({
          lives: { onAir: 10, limit: 10, withoutRoom: 0, roomsRead: false },
          recordings: { running: 0, limit: 2, enabled: false },
        }),
      );
      renderWithProviders(<OperationsTab />);

      const full = await screen.findByText('10 of 10');
      expect(full).toHaveClass('text-red-400');
      expect(
        screen.getByText(/did not answer: every live marked on air is counted/),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Recording is off in this environment.'),
      ).toBeInTheDocument();
    });

    it('says so when the counts cannot be read', async () => {
      api.getOperationsLives.mockRejectedValue(new Error('down'));
      renderWithProviders(<OperationsTab />);

      await waitFor(() =>
        expect(within(section('Lives')).getByRole('alert')).toBeInTheDocument(),
      );
    });
  });

  it('shows the server as the backend sees it, and says what it cannot see', async () => {
    renderWithProviders(<OperationsTab />);

    expect(
      await screen.findByText('Server read at', { exact: false }),
    ).toBeInTheDocument();
    expect(
      within(metric('Server resources', 'Server disk')).getByText('60%'),
    ).toBeInTheDocument();
    expect(
      within(metric('Server resources', 'Server disk')).getByText(
        '40 GB free of 100 GB · alert at 90%',
      ),
    ).toBeInTheDocument();
    expect(
      within(metric('Server resources', 'Uploaded files disk')).getByText(
        'Not available',
      ),
    ).toBeInTheDocument();
    expect(
      within(metric('Server resources', 'Server memory in use')).getByText(
        '3 GB',
      ),
    ).toBeInTheDocument();
    expect(
      within(metric('Server resources', 'Database size')).getByText('2 GB'),
    ).toBeInTheDocument();
    expect(
      within(metric('Server resources', 'Redis memory')).getByText(
        'Limit: none · evicted keys: 0',
      ),
    ).toBeInTheDocument();
    expect(
      within(metric('Server resources', 'CPU load (1 / 5 / 15 min)')).getByText(
        '4 cores',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('waiting 3 · active 1 · delayed 0 · failed 2'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Not visible from inside the backend container'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Memory and CPU of each container/),
    ).toBeInTheDocument();
  });

  it('marks in red a resource past its ADR-0024 threshold, or not answering', async () => {
    api.getOperationsResources.mockResolvedValue(
      resources({
        disks: {
          alertRatio: 0.9,
          root: { totalBytes: 100, freeBytes: 5, usedRatio: 0.95 },
          uploads: { totalBytes: 100, freeBytes: 5, usedRatio: 0.95 },
        },
        process: {
          heapUsedBytes: GIB,
          rssBytes: 2 * GIB,
          heapAlertBytes: GIB,
          rssAlertBytes: GIB,
        },
        database: { reachable: false, sizeBytes: null },
        redis: {
          reachable: false,
          usedMemoryBytes: null,
          peakMemoryBytes: null,
          maxMemoryBytes: null,
          evictedKeys: null,
        },
        container: { memoryBytes: null, memoryLimitBytes: GIB },
      }),
    );
    renderWithProviders(<OperationsTab />);

    await screen.findByText('Server disk');
    expect(
      within(metric('Server resources', 'Server disk')).getByText('95%'),
    ).toHaveClass('text-red-400');
    // The uploads disk has no budget of its own: not red.
    expect(
      within(metric('Server resources', 'Uploaded files disk')).getByText(
        '95%',
      ),
    ).not.toHaveClass('text-red-400');
    expect(
      within(metric('Server resources', 'Backend heap')).getByText('1 GB'),
    ).toHaveClass('text-red-400');
    expect(
      within(metric('Server resources', 'Backend memory (RSS)')).getByText(
        '2 GB',
      ),
    ).toHaveClass('text-red-400');
    expect(
      within(metric('Server resources', 'Database size')).getByText(
        'Not answering',
      ),
    ).toHaveClass('text-red-400');
    expect(
      within(metric('Server resources', 'Redis memory')).getByText(
        'Not answering',
      ),
    ).toHaveClass('text-red-400');
    expect(
      within(metric('Server resources', 'Backend container memory')).getByText(
        'Limit 1 GB',
      ),
    ).toBeInTheDocument();
  });

  it('shows each warehouse table, the last exports and the kind of the last failure', async () => {
    renderWithProviders(<OperationsTab />);

    const table = await screen.findByText('transactions');
    expect(table.nextElementSibling?.textContent).toMatch(
      /^1,234 rows · 2 MB · newest /,
    );
    expect(screen.getByText('0 rows · 0 B · no rows')).toBeInTheDocument();
    expect(screen.getByText('2026-11-24T03-30-00')).toBeInTheDocument();
    expect(screen.getByText('reports 5 · transactions 12')).toBeInTheDocument();
    expect(
      screen.getByText('Last: the load into the warehouse failed'),
    ).toBeInTheDocument();
    expect(
      within(metric('Analytics warehouse', 'Export folder')).getByText(
        'Writable',
      ),
    ).toBeInTheDocument();
  });

  it('says when the warehouse is not set or does not answer', async () => {
    api.getOperationsWarehouse.mockResolvedValue(
      warehouse({
        configured: false,
        tables: null,
        readError: 'unreachable',
        exportFolder: 'not_writable',
        recentExports: [],
        job: null,
      }),
    );
    renderWithProviders(<OperationsTab />);

    expect(
      await screen.findByText('The warehouse did not answer the backend.'),
    ).toBeInTheDocument();
    expect(
      within(metric('Analytics warehouse', 'Warehouse address')).getByText(
        'Not set',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Not writable')).toHaveClass('text-red-400');
    expect(screen.getByText('No export in the folder.')).toBeInTheDocument();
  });

  it('shows the CSP counters by blocked origin and directive, the most frequent first', async () => {
    renderWithProviders(<OperationsTab />);

    const origin = await screen.findByText('https://cdn.example.com');
    expect(origin.nextElementSibling?.textContent).toBe(
      'img-src · report · 12',
    );
    expect(
      within(metric('CSP reports', 'Days with reports')).getByText(
        '2026-11-20 to 2026-11-24',
      ),
    ).toBeInTheDocument();
    expect(
      within(metric('CSP reports', 'Reports')).getByText('17'),
    ).toBeInTheDocument();
  });

  it('says when there is no CSP report', async () => {
    api.getOperationsCsp.mockResolvedValue(
      csp({ days: 0, firstDay: null, lastDay: null, total: 0, rows: [] }),
    );
    renderWithProviders(<OperationsTab />);

    expect(
      await screen.findByText('No CSP violation reports in the last 35 days.'),
    ).toBeInTheDocument();
  });

  /** Opens the page and asks for the orphan files report. */
  const computeOrphans = async () => {
    renderWithProviders(<OperationsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compute' }));
    return screen.findByText('The next run would delete');
  };

  it('computes the orphan files only when asked, and says when it was computed', async () => {
    renderWithProviders(<OperationsTab />);

    await screen.findByText('transactions');
    expect(api.getOperationsOrphanFiles).not.toHaveBeenCalled();
    expect(screen.getByText(/computed only on request/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compute' }));
    expect(
      await screen.findByText(
        /^Computed at .*The server keeps it for 10 minutes\.$/,
      ),
    ).toBeInTheDocument();
    expect(api.getOperationsOrphanFiles).toHaveBeenCalledTimes(1);

    // The page's refresh leaves it alone; its own button asks again.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(api.getOperationsWarehouse).toHaveBeenCalledTimes(2),
    );
    expect(api.getOperationsOrphanFiles).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Compute again' }));
    await waitFor(() =>
      expect(api.getOperationsOrphanFiles).toHaveBeenCalledTimes(2),
    );
  });

  it('shows what the next run of the sweep would delete, in counts and sizes', async () => {
    const next = await computeOrphans();

    expect(next.parentElement?.textContent).toBe(
      'The next run would delete40120 MB',
    );
    expect(
      within(metric('Orphan files', 'Unused for over 168 h')).getByText(
        '120 MB · 1 nights at 300 a night',
      ),
    ).toBeInTheDocument();
    expect(
      within(
        metric('Orphan files', "Not the storage's own (never weighed)"),
      ).getByText('5'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('90 days or more 30 · under 30 days 10'),
    ).toBeInTheDocument();
    expect(screen.getByText('jpg 25 · png 15')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Record of owners: 870 rows, 800 with an owner, 70 without, 3 of a file no longer on the disk.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says when the sweep would stop itself and delete nothing', async () => {
    api.getOperationsOrphanFiles.mockResolvedValue(
      orphans({
        nextRun: { count: 0, bytes: 0 },
        orphans: { count: 400, bytes: GIB, nights: 0 },
        heldBack: {
          reason: 'share_exceeded',
          recentOrphans: 400,
          recentFiles: 600,
        },
      }),
    );
    const next = await computeOrphans();

    expect(screen.getByRole('status')).toHaveTextContent(
      'The sweep would stop itself and delete nothing400 of the 600 files of the last 90 days are unused, more than 50%: the references were probably misread.',
    );
    expect(
      within(next.parentElement as HTMLElement).getByText('0'),
    ).not.toHaveClass('text-red-400');
  });

  it('says why when no row names any file', async () => {
    api.getOperationsOrphanFiles.mockResolvedValue(
      orphans({
        nextRun: { count: 0, bytes: 0 },
        heldBack: { reason: 'no_references', recentOrphans: 9, recentFiles: 9 },
      }),
    );
    await computeOrphans();

    expect(screen.getByRole('status')).toHaveTextContent(
      'No row names any file: the references were probably misread.',
    );
  });

  it('says when the server keeps no files of its own, and lists no breakdown when nothing is unused', async () => {
    api.getOperationsOrphanFiles.mockResolvedValueOnce(
      orphans({ status: 'no_local_storage' }),
    );
    renderWithProviders(<OperationsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compute' }));
    expect(
      await screen.findByText('The server keeps no files on its own disk.'),
    ).toBeInTheDocument();
    cleanup();

    api.getOperationsOrphanFiles.mockResolvedValueOnce(
      orphans({
        orphans: { count: 0, bytes: 0, nights: 0 },
        nextRun: { count: 0, bytes: 0 },
      }),
    );
    await computeOrphans();
    expect(screen.queryByText('By age')).not.toBeInTheDocument();
  });

  it('says when the orphan files could not be computed', async () => {
    api.getOperationsOrphanFiles.mockRejectedValueOnce(new Error('503'));
    renderWithProviders(<OperationsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compute' }));

    expect(
      await within(section('Orphan files')).findByRole('alert'),
    ).toHaveTextContent('This report could not be read.');
  });

  it('shows a queue that did not answer, and a table whose newest row is unknown', async () => {
    renderWithProviders(<OperationsTab />);

    const queue = await screen.findByText('feed-fanout');
    expect(queue.nextElementSibling?.textContent).toBe('Not answering');
    expect(
      screen.getByText('9 rows · 1 kB · newest row unknown'),
    ).toBeInTheDocument();
  });

  it('keeps the other reports when one cannot be read, and reads them all again on request', async () => {
    api.getOperationsCsp.mockRejectedValueOnce(new Error('503'));
    renderWithProviders(<OperationsTab />);

    expect(
      await within(section('CSP reports')).findByRole('alert'),
    ).toHaveTextContent('This report could not be read.');
    expect(await screen.findByText('transactions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(api.getOperationsCsp).toHaveBeenCalledTimes(2);
      expect(api.getOperationsResources).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByText('https://cdn.example.com'),
    ).toBeInTheDocument();
  });

  it('shows placeholders while the reports are on their way', async () => {
    api.getOperationsResources.mockReturnValue(new Promise(() => {}));
    api.getOperationsWarehouse.mockReturnValue(new Promise(() => {}));
    api.getOperationsCsp.mockReturnValue(new Promise(() => {}));
    api.getOperationsOrphanFiles.mockReturnValue(new Promise(() => {}));
    api.getOperationsLives.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<OperationsTab />);

    // The orphan files wait for their button.
    expect(screen.getAllByTestId('ops-loading')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Compute' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('ops-loading')).toHaveLength(5),
    );
    expect(
      screen.getByText(
        "The server's resources and the reports that were manual workflows. Read only.",
      ),
    ).toBeInTheDocument();
  });

  it('writes sizes in the app language', () => {
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 kB');
    expect(formatBytes(1536, 'es')).toBe('1,5 kB');
    expect(formatBytes(5 * 1024 ** 5, 'en')).toBe('5,120 TB');
  });
});
