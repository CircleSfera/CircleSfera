import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import PostModals from './PostModals';

describe('PostModals', () => {
  const setShowDeleteModal = vi.fn();
  const onDelete = vi.fn();
  const setShowEditModal = vi.fn();
  const setEditCaption = vi.fn();
  const onEdit = vi.fn((e: React.FormEvent) => e.preventDefault());

  const closedProps = {
    showDeleteModal: false,
    setShowDeleteModal,
    onDelete,
    isDeleting: false,
    showEditModal: false,
    setShowEditModal,
    editCaption: '',
    setEditCaption,
    onEdit,
    isEditing: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when both modals are closed', () => {
    renderWithProviders(<PostModals {...closedProps} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms delete and closes from cancel', () => {
    const { i18n } = renderWithProviders(
      <PostModals {...closedProps} showDeleteModal />,
    );

    expect(
      screen.getByText(i18n!.t('post.modals.delete_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('post.modals.delete_warning')),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('post.modals.delete') }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('post.modals.cancel') }),
    );

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(setShowDeleteModal).toHaveBeenCalledWith(false);
  });

  it('shows deleting copy while a delete is in flight', () => {
    const { i18n } = renderWithProviders(
      <PostModals {...closedProps} showDeleteModal isDeleting />,
    );

    expect(
      screen.getByRole('button', { name: i18n!.t('post.modals.deleting') }),
    ).toBeDisabled();
  });

  it('edits the caption and submits', () => {
    const { i18n } = renderWithProviders(
      <PostModals {...closedProps} showEditModal editCaption="Hello" />,
    );

    expect(
      screen.getByText(i18n!.t('post.modals.edit_title')),
    ).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(
      i18n!.t('post.modals.write_caption'),
    );
    expect(textarea).toHaveValue('Hello');

    fireEvent.change(textarea, { target: { value: 'Edited' } });
    expect(setEditCaption).toHaveBeenCalledWith('Edited');

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('post.modals.save') }),
    );
    expect(onEdit).toHaveBeenCalled();
  });

  it('closes the edit dialog from cancel and shows saving while in flight', () => {
    const view = renderWithProviders(
      <PostModals {...closedProps} showEditModal />,
    );
    const { i18n } = view;

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('post.modals.cancel') }),
    );
    expect(setShowEditModal).toHaveBeenCalledWith(false);

    view.rerender(<PostModals {...closedProps} showEditModal isEditing />);

    expect(
      screen.getByRole('button', { name: i18n!.t('post.modals.saving') }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: i18n!.t('post.modals.cancel') }),
    ).toBeDisabled();
  });
});
