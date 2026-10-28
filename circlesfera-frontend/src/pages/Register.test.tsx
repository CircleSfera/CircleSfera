import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
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
// The bot check, passed with a button.
vi.mock('../components/auth/TurnstileWidget', () => ({
  default: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('token-1')}>
      pass the check
    </button>
  ),
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
        initialEntries: ['/accounts/emailsignup'],
      },
    });

    fillForm(i18n!, yearsAgo(20));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding'));
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ana@example.com',
        username: 'ana',
        visitorId: 'visitor-1',
        locale: 'en',
        // Told about the newsletter and did not say no.
        newsletter: true,
      }),
    );
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      profile: { id: 'p1' },
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('goes home instead of onboarding while the email is not verified', async () => {
    vi.mocked(authApi.register).mockResolvedValue({} as never);
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p1', username: 'ana', emailConfirmed: false },
    } as never);
    const { i18n } = renderWithProviders(<Register />);

    fillForm(i18n!, yearsAgo(20));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(navigate).not.toHaveBeenCalledWith('/onboarding');
  });

  it('tells the person about the newsletter and sends their no', async () => {
    vi.mocked(authApi.register).mockResolvedValue({} as never);
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p1', username: 'ana' },
    } as never);
    const { i18n } = renderWithProviders(<Register />);

    expect(
      screen.getByText(i18n!.t('auth.register.newsletter_notice')),
    ).toBeInTheDocument();
    const no = screen.getByRole('checkbox', {
      name: i18n!.t('auth.register.newsletter_no'),
    });
    expect(no).not.toBeChecked();
    fireEvent.click(no);
    fillForm(i18n!, yearsAgo(20));

    await waitFor(() =>
      expect(authApi.register).toHaveBeenCalledWith(
        expect.objectContaining({ newsletter: false }),
      ),
    );
  });

  it('still goes to onboarding when the profile cannot be loaded yet', async () => {
    vi.mocked(authApi.register).mockResolvedValue({} as never);
    vi.mocked(profileApi.getMyProfile).mockRejectedValue(new Error('later'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => logged.mockRestore());
    const { i18n } = renderWithProviders(<Register />);

    fillForm(i18n!, yearsAgo(30));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding'));
    expect(logged).toHaveBeenCalledWith(
      'Failed to fetch profile:',
      new Error('later'),
    );
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

  it('says the password is a leaked one when that is why it was refused', async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      Object.assign(new Error('leaked'), {
        status: 400,
        data: { errorCode: 'PASSWORD_LEAKED' },
      }),
    );
    const { i18n } = renderWithProviders(<Register />);

    fillForm(i18n!, yearsAgo(25));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('errors.codes.PASSWORD_LEAKED'),
      ),
    );
    expect(navigate).not.toHaveBeenCalled();
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

  it('has no invite code: no field, and a code in an old link is not sent', async () => {
    vi.mocked(authApi.register).mockResolvedValue({} as never);
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p-1' },
    } as never);
    const { i18n } = renderWithProviders(<Register />, {
      routerProps: {
        initialEntries: ['/accounts/signup?inviteCode=FROM-LINK'],
        useTransitions: false,
      },
    });

    expect(screen.queryByLabelText(/invit/i)).not.toBeInTheDocument();
    expect(screen.getByText('Your world, connected.')).toBeInTheDocument();
    fillForm(i18n!, yearsAgo(25));

    await waitFor(() => expect(authApi.register).toHaveBeenCalled());
    expect(vi.mocked(authApi.register).mock.calls[0][0]).not.toHaveProperty(
      'inviteCode',
    );
  });

  describe('the age, counted to the day', () => {
    const born = (years: number, days: number) => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - years);
      d.setDate(d.getDate() + days);
      // The local day, as the date field gives it.
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    it('refuses someone who turns 16 tomorrow', () => {
      const { i18n } = renderWithProviders(<Register />);

      fillForm(i18n!, born(16, 1));

      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('auth.register.age_error'),
      );
      expect(authApi.register).not.toHaveBeenCalled();
    });

    it('takes someone who turns 16 today', async () => {
      vi.mocked(authApi.register).mockResolvedValue({} as never);
      vi.mocked(profileApi.getMyProfile).mockResolvedValue({
        data: { id: 'p-1' },
      } as never);
      const { i18n } = renderWithProviders(<Register />);

      fillForm(i18n!, born(16, 0));

      await waitFor(() => expect(authApi.register).toHaveBeenCalled());
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('with the bot check on', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('does not send the form until the check is passed, and sends its token after', async () => {
      vi.mocked(authApi.register).mockResolvedValue({} as never);
      vi.mocked(profileApi.getMyProfile).mockResolvedValue({
        data: { id: 'p-1' },
      } as never);
      const { i18n } = renderWithProviders(<Register />);

      fillForm(i18n!, yearsAgo(25));
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('auth.captcha_required'),
      );
      expect(authApi.register).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'pass the check' }));
      fireEvent.click(
        screen.getByRole('button', { name: i18n!.t('auth.register.sign_up') }),
      );

      await waitFor(() =>
        expect(authApi.register).toHaveBeenCalledWith(
          expect.objectContaining({ captchaToken: 'token-1' }),
        ),
      );
    });
  });
});
