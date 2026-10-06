import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, profileApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { renderWithProviders } from '../test/test-utils';
import Register from './Register';

vi.mock('../services', () => ({
  authApi: { register: vi.fn() },
  profileApi: { getMyProfile: vi.fn() },
}));
vi.mock('../utils/visitorId', () => ({
  getVisitorId: vi.fn().mockResolvedValue('visitor-1'),
}));
vi.mock('../components/auth/TurnstileWidget', () => ({
  default: () => null,
}));
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: t, toast: t };
});

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
};

function fillForm(i18n: { t: (k: string) => string }, dob: string) {
  const field = (key: string, value: string) =>
    fireEvent.change(screen.getByLabelText(i18n.t(key), { exact: false }), {
      target: { value },
    });
  field('auth.register.email_label', 'ana@example.com');
  field('auth.register.username_label', 'ana');
  field('auth.register.fullname_label', 'Ana');
  field('auth.register.password_label', 'secret123');
  if (dob) field('auth.register.dob_label', dob);
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('auth.register.sign_up') }),
  );
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: false, profile: null });
  });

  it('creates the account with the app language and goes to onboarding', async () => {
    vi.mocked(authApi.register).mockResolvedValue({} as never);
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p1', username: 'ana' },
    } as never);
    const { i18n } = renderWithProviders(<Register />, {
      routerProps: {
        initialEntries: ['/accounts/emailsignup?inviteCode=INV1'],
      },
    });

    fillForm(i18n!, yearsAgo(20));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding'));
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ana@example.com',
        username: 'ana',
        inviteCode: 'INV1',
        visitorId: 'visitor-1',
        locale: 'en',
      }),
    );
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      profile: { id: 'p1' },
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('still goes to onboarding when the profile cannot be loaded yet', async () => {
    vi.mocked(authApi.register).mockResolvedValue({} as never);
    vi.mocked(profileApi.getMyProfile).mockRejectedValue(new Error('later'));
    const { i18n } = renderWithProviders(<Register />);

    fillForm(i18n!, yearsAgo(30));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding'));
  });

  it('requires a date of birth and refuses anyone under 16', async () => {
    const { i18n } = renderWithProviders(<Register />);

    // The date field is required, so the browser blocks an empty submit;
    // the form still checks it in case the browser lets it through.
    fillForm(i18n!, '');
    const form = screen
      .getByLabelText(i18n!.t('auth.register.email_label'), {
        exact: false,
      })
      .closest('form');
    fireEvent.submit(form!);
    expect(toast.error).toHaveBeenCalledWith(
      i18n!.t('auth.register.dob_required'),
    );

    fillForm(i18n!, yearsAgo(15));
    expect(toast.error).toHaveBeenCalledWith(
      i18n!.t('auth.register.age_error'),
    );
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('says so when the sign-up is refused instead of staying silent', async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      Object.assign(new Error('Email already registered'), { status: 409 }),
    );
    const { i18n } = renderWithProviders(<Register />);

    fillForm(i18n!, yearsAgo(25));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('auth.register.default_error'),
      ),
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
