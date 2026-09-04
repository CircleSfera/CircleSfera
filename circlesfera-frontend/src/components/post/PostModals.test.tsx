import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    render(<PostModals {...closedProps} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms delete and closes from cancel', () => {
    render(<PostModals {...closedProps} showDeleteModal />);

    expect(screen.getByText('Delete Post?')).toBeInTheDocument();
    expect(
      screen.getByText('This action cannot be undone.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(setShowDeleteModal).toHaveBeenCalledWith(false);
  });

  it('shows deleting copy while a delete is in flight', () => {
    render(<PostModals {...closedProps} showDeleteModal isDeleting />);

    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
  });

  it('edits the caption and submits', () => {
    render(<PostModals {...closedProps} showEditModal editCaption="Hello" />);

    expect(screen.getByText('Edit Caption')).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText('Write a caption...');
    expect(textarea).toHaveValue('Hello');

    fireEvent.change(textarea, { target: { value: 'Edited' } });
    expect(setEditCaption).toHaveBeenCalledWith('Edited');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('closes the edit dialog from cancel and shows saving while in flight', () => {
    const { rerender } = render(<PostModals {...closedProps} showEditModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setShowEditModal).toHaveBeenCalledWith(false);

    rerender(<PostModals {...closedProps} showEditModal isEditing />);

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
