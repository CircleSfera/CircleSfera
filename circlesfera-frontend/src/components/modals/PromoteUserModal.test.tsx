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
    renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    expect(screen.getByText('Promover Usuario')).toBeInTheDocument();
    expect(
      screen.getByText('Escribe al menos 3 letras para buscar.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /otorgar permisos/i }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por usuario o email...'),
      { target: { value: 'al' } },
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    expect(adminApi.getUsers).not.toHaveBeenCalled();
  });

  it('cancels from the dialog X without promoting', () => {
    renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('searches standard users and confirms the default moderator role', async () => {
    renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por usuario o email...'),
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
    fireEvent.click(screen.getByRole('button', { name: /otorgar permisos/i }));

    expect(onConfirm).toHaveBeenCalledWith('user-alice', 'MODERATOR');
  });

  it('confirms the chosen staff role', async () => {
    renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por usuario o email...'),
      { target: { value: 'ali' } },
    );
    fireEvent.click(await screen.findByText('Alice Doe'));
    fireEvent.change(screen.getByLabelText('Selecciona el nuevo rol'), {
      target: { value: 'ADMIN' },
    });
    fireEvent.click(screen.getByRole('button', { name: /otorgar permisos/i }));

    expect(onConfirm).toHaveBeenCalledWith('user-alice', 'ADMIN');
  });

  it('lets the operator change the selected user', async () => {
    renderWithProviders(
      <PromoteUserModal isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por usuario o email...'),
      { target: { value: 'ali' } },
    );
    fireEvent.click(await screen.findByText('Alice Doe'));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));

    expect(
      screen.getByPlaceholderText('Buscar por usuario o email...'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /otorgar permisos/i }),
    ).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
