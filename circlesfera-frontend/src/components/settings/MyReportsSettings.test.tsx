import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportsApi } from '../../services/reports.service';
import { renderWithProviders } from '../../test/test-utils';
import MyReportsSettings from './MyReportsSettings';

vi.mock('../../services/reports.service', () => ({
  reportsApi: { getMine: vi.fn() },
}));

const report = (overrides: Record<string, unknown>) => ({
  id: 'r1',
  targetType: 'POST',
  targetId: 'post-1',
  reason: 'SPAM',
  details: null,
  status: 'PENDING',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  ...overrides,
});

describe('MyReportsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says so when the account has filed no reports', async () => {
    vi.mocked(reportsApi.getMine).mockResolvedValue({ data: [] } as never);
    const { i18n } = renderWithProviders(<MyReportsSettings />);

    expect(
      await screen.findByText(i18n!.t('settings.reports.empty')),
    ).toBeInTheDocument();
  });

  it('shows each report in the app language, never the raw codes', async () => {
    vi.mocked(reportsApi.getMine).mockResolvedValue({
      data: [
        report({ id: 'r1', details: 'Same link everywhere' }),
        report({
          id: 'r2',
          targetType: 'USER',
          reason: 'IMPERSONATION',
          status: 'REJECTED',
        }),
      ],
    } as never);
    const { i18n } = renderWithProviders(<MyReportsSettings />);

    const t = i18n!.t.bind(i18n);
    expect(
      await screen.findByText(
        `${t('settings.reports.target_post')} · ${t('report.reasons.spam')}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${t('settings.reports.target_user')} · ${t('report.reasons.impersonation')}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('settings.reports.status_pending')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('settings.reports.status_rejected')),
    ).toBeInTheDocument();
    expect(screen.getByText('Same link everywhere')).toBeInTheDocument();
    expect(
      screen.queryByText(/IMPERSONATION|REJECTED/),
    ).not.toBeInTheDocument();
  });

  it('keeps an unknown code readable instead of showing a missing key', async () => {
    vi.mocked(reportsApi.getMine).mockResolvedValue({
      data: [report({ targetType: 'LIVE', reason: 'NEW_REASON' })],
    } as never);
    renderWithProviders(<MyReportsSettings />);

    expect(await screen.findByText('LIVE · NEW_REASON')).toBeInTheDocument();
  });
});
