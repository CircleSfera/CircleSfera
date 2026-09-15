import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import BlockModal from './BlockModal';

vi.mock('../../services', () => ({
  followsApi: {
    block: vi.fn(),
  },
}));

describe('BlockModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(followsApi.block).mockResolvedValue({} as never);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <BlockModal isOpen={false} onClose={onClose} username="alice" />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the username in the title', () => {
    const { i18n } = renderWithProviders(
      <BlockModal isOpen onClose={onClose} username="alice" />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('modals.block.title', { username: 'alice' })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('modals.block.message')),
    ).toBeInTheDocument();
  });

  it('closes from cancel and the dialog X without blocking', () => {
    const { i18n } = renderWithProviders(
      <BlockModal isOpen onClose={onClose} username="alice" />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('modals.block.cancel') }),
    );
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(followsApi.block).not.toHaveBeenCalled();
  });

  it('blocks the username and closes on success', async () => {
    const { i18n } = renderWithProviders(
      <BlockModal isOpen onClose={onClose} username="alice" />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('modals.block.confirm') }),
    );

    await waitFor(() => {
      expect(followsApi.block).toHaveBeenCalledWith('alice');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
