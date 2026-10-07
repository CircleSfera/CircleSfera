import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
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
  },
}));
vi.mock('../../stores/adminAuthStore', () => ({
  useAdminAuthStore: vi.fn(),
}));

const report = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  reason: 'SPAM',
  details: null,
  status: 'PENDING',
  targetType: 'POST',
  targetId: 'post-1',
  createdAt: '2026-10-01T10:00:00.000Z',
  assignedAdminId: null,
  targetContent: { author: 'ana', text: 'buy followers' },
  ...overrides,
});
const page = (data: unknown[]) => ({
  data: {
    data,
    meta: { page: 1, limit: 10, total: data.length, totalPages: 1 },
  },
});

describe('ReportsTab', () => {
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdminAuthStore).mockImplementation(((
      selector: (s: unknown) => unknown,
    ) => selector({ admin: { id: 'admin-1' } })) as never);
    vi.mocked(adminApi.getReports).mockResolvedValue(page([report()]) as never);
  });

  const openReport = async (author = 'ana') => {
    const utils = renderWithProviders(<ReportsTab onToast={onToast} />);
    fireEvent.click(await screen.findByText(`@${author}`));
    return utils;
  };

  it('starts on the pending queue', async () => {
    renderWithProviders(<ReportsTab onToast={onToast} />);

    expect(await screen.findByText('@ana')).toBeInTheDocument();
    expect(adminApi.getReports).toHaveBeenCalledWith(
      1,
      10,
      undefined,
      'PENDING',
      undefined,
      undefined,
    );
  });

  it('claims a pending report', async () => {
    vi.mocked(adminApi.claimReport).mockResolvedValue({} as never);
    const { i18n } = await openReport();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.reports.claim') }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        i18n!.t('admin.reports.toast_claimed'),
        'success',
      ),
    );
    expect(adminApi.claimReport).toHaveBeenCalledWith('r1');
  });

  it('says another admin claimed it first when the server reports the conflict', async () => {
    vi.mocked(adminApi.claimReport).mockRejectedValue(
      Object.assign(new Error('conflict'), {
        status: 409,
        data: {
          errorCode: 'REPORT_ALREADY_CLAIMED',
          details: { assignedAdminId: 'admin-2' },
        },
      }),
    );
    const { i18n } = await openReport();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.reports.claim') }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        i18n!.t('admin.reports.toast_claim_conflict'),
        'error',
      ),
    );
  });

  it('reports any other claim failure', async () => {
    vi.mocked(adminApi.claimReport).mockRejectedValue(
      Object.assign(new Error('down'), { status: 500, data: {} }),
    );
    const { i18n } = await openReport();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.reports.claim') }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        i18n!.t('admin.reports.toast_claim_error'),
        'error',
      ),
    );
  });

  it('a strike on an urgent account report goes through the penalty flow', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue(
      page([
        report({ targetType: 'USER', details: '[URGENT] threats in DMs' }),
      ]) as never,
    );
    vi.mocked(adminApi.resolveReportWithPenalty).mockResolvedValue({} as never);
    const { i18n } = await openReport();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.reports.strike') }),
    );

    await waitFor(() =>
      expect(adminApi.resolveReportWithPenalty).toHaveBeenCalledWith(
        'r1',
        'STRIKE',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        i18n!.t('admin.reports.toast_strike'),
        'success',
      ),
    );
  });

  it('a ban needs an explicit confirmation', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue(
      page([
        report({ targetType: 'USER', details: '[URGENT] doxxing' }),
      ]) as never,
    );
    vi.mocked(adminApi.resolveReportWithPenalty).mockResolvedValue({} as never);
    const { i18n } = await openReport();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.reports.ban') }),
    );
    expect(adminApi.resolveReportWithPenalty).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(i18n!.t('admin.reports.confirm_ban_message')),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog)
        .getAllByRole('button')
        .find((b) => /ban|confirm/i.test(b.textContent ?? ''))!,
    );

    await waitFor(() =>
      expect(adminApi.resolveReportWithPenalty).toHaveBeenCalledWith(
        'r1',
        'BAN',
      ),
    );
  });

  it('dismisses a report with the staff notes', async () => {
    vi.mocked(adminApi.updateReport).mockResolvedValue({} as never);
    const { i18n } = await openReport();

    const notes = screen.getByRole('textbox', {
      name: i18n!.t('admin.reports.internal_notes_label'),
    });
    fireEvent.change(notes, { target: { value: 'Not spam, a promo' } });
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.reports.ignore') }),
    );

    await waitFor(() =>
      expect(adminApi.updateReport).toHaveBeenCalledWith('r1', {
        status: 'REJECTED',
        internalNotes: 'Not spam, a promo',
      }),
    );
  });

  it('resolves several selected reports at once', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue(
      page([
        report(),
        report({ id: 'r2', targetContent: { author: 'leo' } }),
      ]) as never,
    );
    vi.mocked(adminApi.bulkUpdateReports).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(<ReportsTab onToast={onToast} />);
    await screen.findByText('@leo');

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: i18n!.t('admin.shared.select_all'),
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('admin.reports.bulk_resolve'),
      }),
    );

    await waitFor(() =>
      expect(adminApi.bulkUpdateReports).toHaveBeenCalledWith(
        ['r1', 'r2'],
        'RESOLVED',
      ),
    );
    expect(onToast).toHaveBeenCalledWith(
      i18n!.t('admin.reports.toast_bulk_resolved', { count: 2 }),
      'success',
    );
  });

  it('labels each report checkbox for screen readers', async () => {
    const { i18n } = renderWithProviders(<ReportsTab onToast={onToast} />);

    expect(
      await screen.findByRole('checkbox', {
        name: i18n!.t('admin.reports.select_report', { author: 'ana' }),
      }),
    ).toBeInTheDocument();
  });
});
