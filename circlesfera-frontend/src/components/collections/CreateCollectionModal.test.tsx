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
    const { i18n } = renderWithProviders(
      <CreateCollectionModal isOpen onClose={onClose} />,
    );

    expect(
      screen.getByText(i18n!.t('collections.new_collection')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('collections.create') }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText(i18n!.t('collections.collection_name')),
      {
        target: { value: '   ' },
      },
    );
    expect(
      screen.getByRole('button', { name: i18n!.t('collections.create') }),
    ).toBeDisabled();
    expect(collectionsApi.create).not.toHaveBeenCalled();
  });

  it('closes from the dialog X without creating', () => {
    const { i18n } = renderWithProviders(
      <CreateCollectionModal isOpen onClose={onClose} />,
    );

    fireEvent.change(
      screen.getByLabelText(i18n!.t('collections.collection_name')),
      {
        target: { value: 'Travel' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(collectionsApi.create).not.toHaveBeenCalled();
  });

  it('creates with a trimmed name, optional description, and closes', async () => {
    const { i18n } = renderWithProviders(
      <CreateCollectionModal isOpen onClose={onClose} />,
    );

    fireEvent.change(
      screen.getByLabelText(i18n!.t('collections.collection_name')),
      {
        target: { value: '  Travel  ' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('collections.description_label')),
      {
        target: { value: '  Summer trips  ' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('collections.create') }),
    );

    await waitFor(() => {
      expect(collectionsApi.create).toHaveBeenCalledWith({
        name: 'Travel',
        description: 'Summer trips',
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('clears the name and description when the dialog reopens', () => {
    const view = renderWithProviders(
      <CreateCollectionModal isOpen onClose={onClose} />,
    );
    const { i18n } = view;

    fireEvent.change(
      screen.getByLabelText(i18n!.t('collections.collection_name')),
      {
        target: { value: 'Travel' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('collections.description_label')),
      {
        target: { value: 'Notes' },
      },
    );
    view.rerender(<CreateCollectionModal isOpen={false} onClose={onClose} />);
    view.rerender(<CreateCollectionModal isOpen onClose={onClose} />);

    expect(
      screen.getByLabelText(i18n!.t('collections.collection_name')),
    ).toHaveValue('');
    expect(
      screen.getByLabelText(i18n!.t('collections.description_label')),
    ).toHaveValue('');
    expect(
      screen.getByRole('button', { name: i18n!.t('collections.create') }),
    ).toBeDisabled();
  });
});
