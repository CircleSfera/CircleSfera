import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n, renderWithProviders } from '../../test/test-utils';
import ConfirmModal from './ConfirmModal';

describe('ConfirmModal', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const i18n = createTestI18n();
    renderWithProviders(
      <ConfirmModal
        isOpen={false}
        onClose={onClose}
        onConfirm={onConfirm}
        title={i18n.t('post.modals.delete_title')}
        message={i18n.t('post.modals.delete_warning')}
      />,
      { i18n },
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms and cancels from the actions', () => {
    const i18n = createTestI18n();
    renderWithProviders(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title={i18n.t('post.modals.delete_title')}
        message={i18n.t('post.modals.delete_warning')}
        confirmText={i18n.t('post.modals.delete')}
        cancelText={i18n.t('post.modals.cancel')}
      />,
      { i18n },
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t('post.modals.delete_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t('post.modals.delete_warning')),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('post.modals.delete') }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('post.modals.cancel') }),
    );

    expect(onConfirm).toHaveBeenCalledWith(undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the dialog X', () => {
    const i18n = createTestI18n();
    renderWithProviders(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title={i18n.t('post.modals.delete_title')}
        message={i18n.t('post.modals.delete_warning')}
      />,
      { i18n },
    );

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables confirm while loading', () => {
    const i18n = createTestI18n();
    renderWithProviders(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title={i18n.t('post.modals.delete_title')}
        message={i18n.t('post.modals.delete_warning')}
        confirmText={i18n.t('post.modals.deleting')}
        cancelText={i18n.t('post.modals.cancel')}
        isLoading
      />,
      { i18n },
    );

    expect(
      screen.getByRole('button', { name: i18n.t('post.modals.deleting') }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: i18n.t('post.modals.cancel') }),
    ).toBeDisabled();
  });

  it('requires input before confirm and passes the trimmed value', () => {
    const i18n = createTestI18n();
    renderWithProviders(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title={i18n.t('admin.appeals.reject')}
        message={i18n.t('admin.appeals.notes_prompt_reject')}
        confirmText={i18n.t('admin.appeals.reject')}
        cancelText={i18n.t('admin.shared.cancel')}
        showInput
        inputRequired
        inputLabel={i18n.t('admin.appeals.admin_notes')}
      />,
      { i18n },
    );

    const confirm = screen.getByRole('button', {
      name: i18n.t('admin.appeals.reject'),
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText(i18n.t('admin.appeals.admin_notes')),
      {
        target: { value: '  spam  ' },
      },
    );
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('spam');
  });
});
