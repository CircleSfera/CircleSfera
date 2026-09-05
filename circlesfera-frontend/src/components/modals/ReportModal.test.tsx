import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import ReportModal from './ReportModal';

vi.mock('../../services', () => ({
  reportsApi: {
    create: vi.fn(),
  },
}));

describe('ReportModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportsApi.create).mockResolvedValue({} as never);
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

  it('keeps submit disabled until a reason is chosen', () => {
    renderWithProviders(
      <ReportModal
        isOpen
        onClose={onClose}
        targetType="POST"
        targetId="post-1"
      />,
    );

    expect(
      screen.getByText('Why are you reporting this post?'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit report' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByText("It's spam"));
    expect(screen.getByRole('button', { name: 'Submit report' })).toBeEnabled();
    expect(reportsApi.create).not.toHaveBeenCalled();
  });

  it('submits the selected reason and optional details', async () => {
    renderWithProviders(
      <ReportModal
        isOpen
        onClose={onClose}
        targetType="POST"
        targetId="post-1"
      />,
    );

    fireEvent.click(screen.getByText("It's spam"));
    fireEvent.change(
      screen.getByPlaceholderText('Additional details (optional)'),
      { target: { value: '  repeated links  ' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

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
    renderWithProviders(
      <ReportModal
        isOpen
        onClose={onClose}
        targetType="USER"
        targetId="user-2"
      />,
    );

    fireEvent.click(screen.getByText("It's spam"));
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => {
      expect(reportsApi.create).toHaveBeenCalledWith({
        targetType: 'USER',
        targetId: 'user-2',
        reason: 'SPAM',
        details: undefined,
      });
    });
    expect(screen.getByText('Thanks for your report')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
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
