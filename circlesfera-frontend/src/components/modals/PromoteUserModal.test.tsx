import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import PromoteUserModal from './PromoteUserModal';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getUsers: vi.fn(),
  },
}));

const alice: AdminUser = {
  id: 'user-alice',
  email: 'alice@circlesfera.test',
  isActive: true,
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  postCount: 0,
  profile: {
    username: 'alice',
    fullName: 'Alice Doe',
    avatar: null,
  },
};

describe('PromoteUserModal', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getUsers).mockResolvedValue({
      data: { data: [alice] },
    } as never);
  });

  it('renders nothing when closed and does not search', () => {
    renderWithProviders(
      <PromoteUserModal
        isOpen={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(adminApi.getUsers).not.toHaveBeenCalled();
  });

  it('keeps confirm disabled and does not search until three characters', async () => {
    const { i18n } = renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    expect(
      screen.getByText(i18n!.t('admin.users.promote_modal.title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('admin.users.promote_modal.min_chars')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('admin.users.promote_modal.confirm'),
      }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText(
        i18n!.t('admin.users.promote_modal.search_placeholder'),
      ),
      { target: { value: 'al' } },
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    expect(adminApi.getUsers).not.toHaveBeenCalled();
  });

  it('cancels from the dialog X without promoting', () => {
    const { i18n } = renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('common.cancel') }),
    );

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('searches standard users and confirms the default moderator role', async () => {
    const { i18n } = renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        i18n!.t('admin.users.promote_modal.search_placeholder'),
      ),
      { target: { value: 'ali' } },
    );

    await waitFor(() => {
      expect(adminApi.getUsers).toHaveBeenCalledWith(
        1,
        10,
        'ali',
        undefined,
        'USER',
      );
    });
    fireEvent.click(await screen.findByText('Alice Doe'));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('admin.users.promote_modal.confirm'),
      }),
    );

    expect(onConfirm).toHaveBeenCalledWith('user-alice', 'MODERATOR');
  });

  it('confirms the chosen staff role', async () => {
    const { i18n } = renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        i18n!.t('admin.users.promote_modal.search_placeholder'),
      ),
      { target: { value: 'ali' } },
    );
    fireEvent.click(await screen.findByText('Alice Doe'));
    fireEvent.change(
      screen.getByLabelText(i18n!.t('admin.users.promote_modal.role_label')),
      {
        target: { value: 'ADMIN' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('admin.users.promote_modal.confirm'),
      }),
    );

    expect(onConfirm).toHaveBeenCalledWith('user-alice', 'ADMIN');
  });

  it('lets the operator change the selected user', async () => {
    const { i18n } = renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        i18n!.t('admin.users.promote_modal.search_placeholder'),
      ),
      { target: { value: 'ali' } },
    );
    fireEvent.click(await screen.findByText('Alice Doe'));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('admin.users.promote_modal.change'),
      }),
    );

    expect(
      screen.getByPlaceholderText(
        i18n!.t('admin.users.promote_modal.search_placeholder'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('admin.users.promote_modal.confirm'),
      }),
    ).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
