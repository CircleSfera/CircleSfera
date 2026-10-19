import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_TAB_PERMISSIONS,
  adminTabPath,
  getAdminHomeTab,
} from '../components/admin/adminNav';
import { adminAuthApi } from '../services/admin-auth.service';
import { useAdminAuthStore } from '../stores/adminAuthStore';
import { renderWithProviders } from '../test/test-utils';
import AdminPanelLogin from './AdminPanelLogin';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../services/admin-auth.service', () => ({
  adminAuthApi: {
    login: vi.fn(),
    enrol: vi.fn(),
    verifyMfa: vi.fn(),
    me: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const SUPER_ADMIN = {
  id: 'admin-1',
  email: 'staff@example.com',
  displayName: 'Staff',
  totpEnabled: true,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

function submitCredentials(
  i18n: I18nInstance,
  email = ' staff@example.com ',
  password = 'correct horse',
) {
  fireEvent.change(screen.getByLabelText(i18n.t('adminPanel.login.email')), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(i18n.t('adminPanel.login.password')), {
    target: { value: password },
  });
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('adminPanel.login.continue') }),
  );
}

async function reachCodeStep(i18n: I18nInstance) {
  vi.mocked(adminAuthApi.login).mockResolvedValue({
    data: { status: 'MFA_REQUIRED', mfaToken: 'mfa-token' },
  } as never);
  submitCredentials(i18n);
  return screen.findByLabelText(i18n.t('adminPanel.login.mfa_code'));
}

// The only way in: the password, then the code of the authenticator.
async function signInWithCode(i18n: I18nInstance) {
  vi.mocked(adminAuthApi.verifyMfa).mockResolvedValue({
    data: { status: 'OK' },
  } as never);
  const codeInput = await reachCodeStep(i18n);
  fireEvent.change(codeInput, { target: { value: '123456' } });
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('adminPanel.login.verify') }),
  );
}

describe('Admin Panel sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAdminAuthStore.setState({ admin: null, isAuthenticated: false });
    vi.mocked(adminAuthApi.me).mockResolvedValue({
      data: SUPER_ADMIN,
    } as never);
  });

  it('keeps the continue button off until email and password are filled', () => {
    const { i18n } = renderWithProviders(<AdminPanelLogin />);
    const submit = screen.getByRole('button', {
      name: i18n!.t('adminPanel.login.continue'),
    });

    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(i18n!.t('adminPanel.login.email')), {
      target: { value: 'staff@example.com' },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(
      screen.getByLabelText(i18n!.t('adminPanel.login.password')),
      { target: { value: 'correct horse' } },
    );
    expect(submit).toBeEnabled();
  });

  it('signs a super admin in and opens the first tab of the panel', async () => {
    const { i18n } = renderWithProviders(<AdminPanelLogin />);

    await signInWithCode(i18n!);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        adminTabPath(getAdminHomeTab(() => true)),
        { replace: true },
      ),
    );
    expect(adminAuthApi.login).toHaveBeenCalledWith(
      'staff@example.com',
      'correct horse',
    );
    expect(useAdminAuthStore.getState().admin).toEqual(SUPER_ADMIN);
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('opens the first tab the staff member is allowed to see', async () => {
    vi.mocked(adminAuthApi.me).mockResolvedValue({
      data: { ...SUPER_ADMIN, roles: ['AUDITOR'], permissions: ['audit'] },
    } as never);
    const { i18n } = renderWithProviders(<AdminPanelLogin />);

    await signInWithCode(i18n!);

    const expectedTab = getAdminHomeTab((key) => key === 'audit');
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(adminTabPath(expectedTab), {
        replace: true,
      }),
    );
    expect(expectedTab).toBe('audit');
    expect(ADMIN_TAB_PERMISSIONS.audit).toBe('audit');
  });

  it('gives a staff manager the same first tab as a super admin', async () => {
    vi.mocked(adminAuthApi.me).mockResolvedValue({
      data: {
        ...SUPER_ADMIN,
        roles: ['MANAGER'],
        permissions: ['admins.manage'],
      },
    } as never);
    const { i18n } = renderWithProviders(<AdminPanelLogin />);

    await signInWithCode(i18n!);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        adminTabPath(getAdminHomeTab(() => true)),
        { replace: true },
      ),
    );
  });

  it('explains refused credentials in the app language', async () => {
    vi.mocked(adminAuthApi.login).mockRejectedValue(
      Object.assign(new Error('Unauthorized'), {
        status: 401,
        data: { message: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
      }),
    );
    const { i18n } = renderWithProviders(<AdminPanelLogin />);

    submitCredentials(i18n!);

    expect(
      await screen.findByText(i18n!.t('adminPanel.login.invalid')),
    ).toBeInTheDocument();
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('says the account is locked, not that the credentials are wrong', async () => {
    vi.mocked(adminAuthApi.login).mockRejectedValue(
      Object.assign(new Error('Account temporarily locked'), {
        status: 403,
        data: {
          message: 'Account temporarily locked',
          errorCode: 'HTTP_EXCEPTION',
        },
      }),
    );
    const { i18n } = renderWithProviders(<AdminPanelLogin />);

    submitCredentials(i18n!);

    expect(
      await screen.findByText(i18n!.t('adminPanel.login.locked')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('adminPanel.login.invalid')),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Account temporarily locked'),
    ).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not count as signed in when the staff profile cannot be loaded', async () => {
    vi.mocked(adminAuthApi.me).mockRejectedValue(
      Object.assign(new Error('boom'), { status: 500 }),
    );
    const { i18n } = renderWithProviders(<AdminPanelLogin />);

    await signInWithCode(i18n!);

    expect(
      await screen.findByText(i18n!.t('errors.generic.server')),
    ).toBeInTheDocument();
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAdminAuthStore.getState().admin).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('asks for the code and signs in once it is verified', async () => {
    vi.mocked(adminAuthApi.verifyMfa).mockResolvedValue({
      data: { status: 'OK' },
    } as never);
    const { i18n } = renderWithProviders(<AdminPanelLogin />);
    const codeInput = await reachCodeStep(i18n!);
    const verify = screen.getByRole('button', {
      name: i18n!.t('adminPanel.login.verify'),
    });

    expect(adminAuthApi.me).not.toHaveBeenCalled();
    fireEvent.change(codeInput, { target: { value: '12a34' } });
    expect(codeInput).toHaveValue('1234');
    expect(verify).toBeDisabled();

    fireEvent.change(codeInput, { target: { value: '123 4567' } });
    expect(codeInput).toHaveValue('123456');
    fireEvent.click(verify);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        adminTabPath(getAdminHomeTab(() => true)),
        { replace: true },
      ),
    );
    expect(adminAuthApi.verifyMfa).toHaveBeenCalledWith('mfa-token', '123456');
  });

  it('explains a refused code in the app language and stays on the code step', async () => {
    vi.mocked(adminAuthApi.verifyMfa).mockRejectedValue(
      Object.assign(new Error('TOTP mismatch'), { status: 401 }),
    );
    const { i18n } = renderWithProviders(<AdminPanelLogin />);
    const codeInput = await reachCodeStep(i18n!);

    fireEvent.change(codeInput, { target: { value: '000000' } });
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('adminPanel.login.verify') }),
    );

    expect(
      await screen.findByText(i18n!.t('adminPanel.login.invalid_mfa')),
    ).toBeInTheDocument();
    expect(screen.queryByText('TOTP mismatch')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns to the credentials step with the code and the error cleared', async () => {
    vi.mocked(adminAuthApi.verifyMfa).mockRejectedValue(
      Object.assign(new Error('TOTP mismatch'), { status: 401 }),
    );
    const { i18n } = renderWithProviders(<AdminPanelLogin />);
    const codeInput = await reachCodeStep(i18n!);
    fireEvent.change(codeInput, { target: { value: '000000' } });
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('adminPanel.login.verify') }),
    );
    await screen.findByText(i18n!.t('adminPanel.login.invalid_mfa'));

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('adminPanel.login.back') }),
    );

    expect(
      screen.getByLabelText(i18n!.t('adminPanel.login.email')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('adminPanel.login.invalid_mfa')),
    ).not.toBeInTheDocument();
  });

  describe('first sign-in, setting up the authenticator', () => {
    const setupAnswer = (qrCodeDataUrl?: string) => ({
      data: {
        status: 'MFA_SETUP_REQUIRED',
        mfaToken: 'setup-token',
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl,
      },
    });

    beforeEach(() => {
      vi.mocked(adminAuthApi.login).mockResolvedValue({
        data: { status: 'ENROLMENT_PROOF_REQUIRED', mfaToken: 'proof-token' },
      } as never);
    });

    const typeProof = (i18n: I18nInstance, value: string) => {
      fireEvent.change(
        screen.getByLabelText(i18n.t('adminPanel.login.enrol_code')),
        { target: { value } },
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('adminPanel.login.enrol_continue'),
        }),
      );
    };

    async function reachSetupStep(i18n: I18nInstance, qrCodeDataUrl?: string) {
      vi.mocked(adminAuthApi.enrol).mockResolvedValue(
        setupAnswer(qrCodeDataUrl) as never,
      );
      submitCredentials(i18n);
      await screen.findByText(i18n.t('adminPanel.login.enrol_title'));
      typeProof(i18n, 'abcd-efgh-jkmn');
      await screen.findByText(i18n.t('adminPanel.login.mfa_setup'));
    }

    it('asks for the set-up code before showing anything of the authenticator', async () => {
      const { i18n } = renderWithProviders(<AdminPanelLogin />);
      await reachSetupStep(i18n!);

      expect(adminAuthApi.enrol).toHaveBeenCalledWith(
        'proof-token',
        'abcd-efgh-jkmn',
      );
    });

    it('uses the set-up link at once, and takes it off the address', async () => {
      vi.mocked(adminAuthApi.enrol).mockResolvedValue(setupAnswer() as never);
      window.history.replaceState(null, '', '/login#enrol=link-token-123');
      const { i18n } = renderWithProviders(<AdminPanelLogin />);
      // Taken off the address at once.
      expect(window.location.hash).toBe('');

      submitCredentials(i18n!);

      expect(
        await screen.findByText(i18n!.t('adminPanel.login.mfa_setup')),
      ).toBeInTheDocument();
      expect(adminAuthApi.enrol).toHaveBeenCalledWith(
        'proof-token',
        'link-token-123',
      );
    });

    it('says a used or expired link or code does not work, and lets another be typed', async () => {
      vi.mocked(adminAuthApi.enrol).mockRejectedValue({
        isAxiosError: true,
        response: { status: 401, data: {} },
      });
      const { i18n } = renderWithProviders(<AdminPanelLogin />);
      submitCredentials(i18n!);
      await screen.findByText(i18n!.t('adminPanel.login.enrol_title'));

      typeProof(i18n!, 'WRONG-CODE-123');

      expect(
        await screen.findByText(i18n!.t('adminPanel.login.enrol_invalid')),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(i18n!.t('adminPanel.login.enrol_code')),
      ).toBeInTheDocument();
      expect(adminAuthApi.verifyMfa).not.toHaveBeenCalled();
    });

    it('goes back to the credentials from the set-up step, with the code and the error cleared', async () => {
      vi.mocked(adminAuthApi.enrol).mockRejectedValue({
        isAxiosError: true,
        response: { status: 401, data: {} },
      });
      const { i18n } = renderWithProviders(<AdminPanelLogin />);
      submitCredentials(i18n!);
      await screen.findByText(i18n!.t('adminPanel.login.enrol_title'));
      typeProof(i18n!, 'WRONG-CODE-123');
      await screen.findByText(i18n!.t('adminPanel.login.enrol_invalid'));

      fireEvent.click(
        screen.getByRole('button', { name: i18n!.t('adminPanel.login.back') }),
      );

      expect(
        screen.getByLabelText(i18n!.t('adminPanel.login.password')),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(i18n!.t('adminPanel.login.enrol_invalid')),
      ).not.toBeInTheDocument();
      submitCredentials(i18n!);
      expect(
        await screen.findByLabelText(i18n!.t('adminPanel.login.enrol_code')),
      ).toHaveValue('');
    });

    it('says the account is locked after too many wrong proofs', async () => {
      vi.mocked(adminAuthApi.enrol).mockRejectedValue({
        isAxiosError: true,
        response: { status: 403, data: {} },
      });
      const { i18n } = renderWithProviders(<AdminPanelLogin />);
      submitCredentials(i18n!);
      await screen.findByText(i18n!.t('adminPanel.login.enrol_title'));

      typeProof(i18n!, 'WRONG-CODE-123');

      expect(
        await screen.findByText(i18n!.t('adminPanel.login.locked')),
      ).toBeInTheDocument();
    });

    it('shows the QR code and the secret, and verifies with the setup token', async () => {
      vi.mocked(adminAuthApi.verifyMfa).mockResolvedValue({
        data: { status: 'OK' },
      } as never);
      const { i18n } = renderWithProviders(<AdminPanelLogin />);
      await reachSetupStep(i18n!, 'data:image/png;base64,qr');

      expect(
        screen.getByAltText(i18n!.t('adminPanel.login.mfa_qr_alt')),
      ).toHaveAttribute('src', 'data:image/png;base64,qr');
      expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

      fireEvent.change(
        screen.getByLabelText(i18n!.t('adminPanel.login.mfa_code')),
        { target: { value: '654321' } },
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('adminPanel.login.verify'),
        }),
      );

      await waitFor(() =>
        expect(adminAuthApi.verifyMfa).toHaveBeenCalledWith(
          'setup-token',
          '654321',
        ),
      );
    });

    it('copies the secret, and says so when the browser refuses', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
      const { i18n } = renderWithProviders(<AdminPanelLogin />);
      await reachSetupStep(i18n!);
      const copy = screen.getByRole('button', {
        name: i18n!.t('adminPanel.login.copy_secret'),
      });

      expect(
        screen.queryByAltText(i18n!.t('adminPanel.login.mfa_qr_alt')),
      ).not.toBeInTheDocument();
      fireEvent.click(copy);

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          i18n!.t('adminPanel.login.secret_copied'),
        ),
      );
      expect(writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');

      writeText.mockRejectedValue(new Error('denied'));
      fireEvent.click(copy);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n!.t('adminPanel.login.secret_copy_failed'),
        ),
      );
    });
  });
});
