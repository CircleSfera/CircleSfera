import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmModal from './ConfirmModal';

describe('ConfirmModal', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(
      <ConfirmModal
        isOpen={false}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete?"
        message="Cannot undo."
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms and cancels from the actions', () => {
    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete?"
        message="Cannot undo."
        confirmText="Delete"
        cancelText="Cancel"
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('Cannot undo.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onConfirm).toHaveBeenCalledWith(undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the dialog X', () => {
    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete?"
        message="Cannot undo."
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables confirm while loading', () => {
    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete?"
        message="Cannot undo."
        confirmText="Deleting..."
        isLoading
      />,
    );

    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('requires input before confirm and passes the trimmed value', () => {
    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Reject?"
        message="Give a reason."
        confirmText="Reject"
        showInput
        inputRequired
        inputLabel="Reason"
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Reject' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: '  spam  ' },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('spam');
  });
});
