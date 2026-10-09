import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuthApi } from '../../services/admin-auth.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { renderWithProviders } from '../../test/test-utils';
import BackofficeApp from './BackofficeApp';

vi.mock('../../services/admin-auth.service', () => ({
  adminAuthApi: {
    me: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../AdminPanelLogin', () => ({
  default: () => <div data-testid="staff-sign-in" />,
}));

const operator = {
  id: 'admin-1',
  email: 'owner@circlesfera.com',
  roles: ['administrator'],
  permissions: ['payments'],
};

describe('BackofficeApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAdminAuthStore.setState({
      admin: null,
      isAuthenticated: false,
      isSessionChecked: false,
      isCheckingSession: false,
    });
  });

  it('sends a visitor without a staff session to the staff sign-in', async () => {
    vi.mocked(adminAuthApi.me).mockRejectedValue(new Error('401'));

    renderWithProviders(<BackofficeApp />);

    expect(await screen.findByTestId('staff-sign-in')).toBeInTheDocument();
  });

  it('shows the home to a signed-in operator, with who they are', async () => {
    vi.mocked(adminAuthApi.me).mockResolvedValue({ data: operator } as never);

    const { i18n } = renderWithProviders(<BackofficeApp />);

    expect(
      await screen.findByRole('heading', {
        name: i18n!.t('backoffice.home.title'),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(operator.email)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('adminPanel.title') }),
    ).toBeInTheDocument();
  });

  it('signing out ends the session and returns to the sign-in', async () => {
    vi.mocked(adminAuthApi.me).mockResolvedValue({ data: operator } as never);

    const { i18n } = renderWithProviders(<BackofficeApp />);
    fireEvent.click(
      await screen.findByRole('button', { name: i18n!.t('adminPanel.logout') }),
    );

    expect(await screen.findByTestId('staff-sign-in')).toBeInTheDocument();
    expect(adminAuthApi.logout).toHaveBeenCalled();
  });
});
