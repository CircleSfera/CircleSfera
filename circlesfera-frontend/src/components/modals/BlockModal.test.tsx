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
    renderWithProviders(
      <BlockModal isOpen onClose={onClose} username="alice" />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Block @alice?')).toBeInTheDocument();
    expect(
      screen.getByText(
        "They won't be able to find your profile, posts, or story on CircleSfera.",
      ),
    ).toBeInTheDocument();
  });

  it('closes from cancel and the dialog X without blocking', () => {
    renderWithProviders(
      <BlockModal isOpen onClose={onClose} username="alice" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(followsApi.block).not.toHaveBeenCalled();
  });

  it('blocks the username and closes on success', async () => {
    renderWithProviders(
      <BlockModal isOpen onClose={onClose} username="alice" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => {
      expect(followsApi.block).toHaveBeenCalledWith('alice');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
