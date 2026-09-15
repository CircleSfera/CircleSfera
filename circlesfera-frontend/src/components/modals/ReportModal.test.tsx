import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import ReportModal, { REPORT_REASONS } from './ReportModal';

vi.mock('../../services', () => ({
  reportsApi: {
    create: vi.fn(),
  },
}));

const spam = REPORT_REASONS.find((r) => r.id === 'SPAM');

describe('ReportModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportsApi.create).mockResolvedValue({} as never);
    if (!spam) throw new Error('REPORT_REASONS is missing SPAM');
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <ReportModal
        isOpen={false}
        onClose={onClose}
        targetType="POST"
        targetId="post-1"
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every catalog reason and keeps submit disabled until one is chosen', () => {
    const { i18n } = renderWithProviders(
      <ReportModal
        isOpen
        onClose={onClose}
        targetType="POST"
        targetId="post-1"
      />,
    );

    expect(
      screen.getByText(
        i18n!.t('report.why_report', {
          targetType: i18n!.t('report.targets.post'),
        }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('report.submit') }),
    ).toBeDisabled();

    for (const reason of REPORT_REASONS) {
      const label = i18n!.t(reason.labelKey);
      expect(label).not.toBe(reason.labelKey);
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByText(i18n!.t(spam!.labelKey)));
    expect(
      screen.getByRole('button', { name: i18n!.t('report.submit') }),
    ).toBeEnabled();
    expect(reportsApi.create).not.toHaveBeenCalled();
  });

  it('submits the selected reason and optional details', async () => {
    const { i18n } = renderWithProviders(
      <ReportModal
        isOpen
        onClose={onClose}
        targetType="POST"
        targetId="post-1"
      />,
    );

    fireEvent.click(screen.getByText(i18n!.t(spam!.labelKey)));
    fireEvent.change(
      screen.getByPlaceholderText(i18n!.t('report.placeholder')),
      { target: { value: '  repeated links  ' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('report.submit') }),
    );

    await waitFor(() => {
      expect(reportsApi.create).toHaveBeenCalledWith({
        targetType: 'POST',
        targetId: 'post-1',
        reason: 'SPAM',
        details: 'repeated links',
      });
    });
  });

  it('shows success after a report without details', async () => {
    const { i18n } = renderWithProviders(
      <ReportModal
        isOpen
        onClose={onClose}
        targetType="USER"
        targetId="user-2"
      />,
    );

    fireEvent.click(screen.getByText(i18n!.t(spam!.labelKey)));
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('report.submit') }),
    );

    await waitFor(() => {
      expect(reportsApi.create).toHaveBeenCalledWith({
        targetType: 'USER',
        targetId: 'user-2',
        reason: 'SPAM',
        details: undefined,
      });
    });
    expect(screen.getByText(i18n!.t('report.success'))).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('agrees gender for a user report in Spanish', () => {
    const { i18n } = renderWithProviders(
      <ReportModal
        isOpen
        onClose={onClose}
        targetType="USER"
        targetId="user-2"
      />,
      { lng: 'es' },
    );

    expect(i18n!.t('report.targets.user')).toBe('esta cuenta');
    expect(
      screen.getByText(
        i18n!.t('report.why_report', {
          targetType: i18n!.t('report.targets.user'),
        }),
      ),
    ).toHaveTextContent('esta cuenta');
    expect(screen.queryByText(/este cuenta/)).not.toBeInTheDocument();
  });

  it('closes from the dialog X without creating a report', () => {
    renderWithProviders(
      <ReportModal
        isOpen
        onClose={onClose}
        targetType="POST"
        targetId="post-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(reportsApi.create).not.toHaveBeenCalled();
  });
});
