import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import CreateCollectionModal from './CreateCollectionModal';

vi.mock('../../services', () => ({
  collectionsApi: {
    create: vi.fn(),
  },
}));

describe('CreateCollectionModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectionsApi.create).mockResolvedValue({} as never);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <CreateCollectionModal isOpen={false} onClose={onClose} />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(collectionsApi.create).not.toHaveBeenCalled();
  });

  it('keeps create disabled until the name has a non-space character', () => {
    renderWithProviders(<CreateCollectionModal isOpen onClose={onClose} />);

    expect(screen.getByText('New Collection')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Collection' }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Collection Name'), {
      target: { value: '   ' },
    });
    expect(
      screen.getByRole('button', { name: 'Create Collection' }),
    ).toBeDisabled();
    expect(collectionsApi.create).not.toHaveBeenCalled();
  });

  it('closes from the dialog X without creating', () => {
    renderWithProviders(<CreateCollectionModal isOpen onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Collection Name'), {
      target: { value: 'Travel' },
    });
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(collectionsApi.create).not.toHaveBeenCalled();
  });

  it('creates with a trimmed name and closes', async () => {
    renderWithProviders(<CreateCollectionModal isOpen onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Collection Name'), {
      target: { value: '  Travel  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Collection' }));

    await waitFor(() => {
      expect(collectionsApi.create).toHaveBeenCalledWith('Travel');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('clears the name when the dialog reopens', () => {
    const view = renderWithProviders(
      <CreateCollectionModal isOpen onClose={onClose} />,
    );

    fireEvent.change(screen.getByLabelText('Collection Name'), {
      target: { value: 'Travel' },
    });
    view.rerender(<CreateCollectionModal isOpen={false} onClose={onClose} />);
    view.rerender(<CreateCollectionModal isOpen onClose={onClose} />);

    expect(screen.getByLabelText('Collection Name')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Create Collection' }),
    ).toBeDisabled();
  });
});
