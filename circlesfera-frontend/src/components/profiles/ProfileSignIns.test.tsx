import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ProfileSignIn, signInsApi } from '../../services/signIns.service';
import { renderWithProviders } from '../../test/test-utils';
import ProfileSignIns from './ProfileSignIns';

vi.mock('../../services/signIns.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/signIns.service')>()),
  signInsApi: { list: vi.fn(), giveOwn: vi.fn(), share: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const main = {
  id: 's-main',
  email: 'ana@example.com',
  emailVerified: true,
  shared: true,
  current: true,
};
const shared: ProfileSignIn[] = [
  { profileId: 'p-1', username: 'ana', signIn: main },
  { profileId: 'p-2', username: 'ana.shop', signIn: main },
];
const withOwn: ProfileSignIn[] = [
  { profileId: 'p-1', username: 'ana', signIn: { ...main, shared: false } },
  {
    profileId: 'p-2',
    username: 'ana.shop',
    signIn: {
      id: 's-shop',
      email: 'shop@example.com',
      emailVerified: false,
      shared: false,
      current: false,
    },
  },
];
const refused = (errorCode: string) =>
  Object.assign(new Error('server text, never shown'), {
    status: 400,
    data: { errorCode },
  });

describe('ProfileSignIns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signInsApi.list).mockResolvedValue({ data: shared } as never);
  });

  const open = async (list = shared, username = 'ana.shop') => {
    vi.mocked(signInsApi.list).mockResolvedValue({ data: list } as never);
    const user = userEvent.setup();
    const view = renderWithProviders(<ProfileSignIns />);
    const row = (await screen.findByText(`@${username}`)).closest('li')!;
    await user.click(within(row).getByRole('button'));
    return {
      user,
      i18n: view.i18n!,
      dialog: await screen.findByRole('dialog'),
    };
  };

  it('says how each profile signs in: the email, shared or its own, and when it is not verified', async () => {
    vi.mocked(signInsApi.list).mockResolvedValue({ data: withOwn } as never);
    const { i18n } = renderWithProviders(<ProfileSignIns />);

    const shop = (await screen.findByText('@ana.shop')).closest('li')!;
    expect(within(shop).getByText('shop@example.com')).toBeVisible();
    expect(
      within(shop).getByText(
        `${i18n!.t('settings.signIns.own')} · ${i18n!.t('settings.signIns.unverified')}`,
      ),
    ).toBeVisible();
    // Its own sign-in can go back to the one of the other profile.
    expect(
      within(shop).getByRole('button', {
        name: i18n!.t('settings.signIns.share_again'),
      }),
    ).toBeVisible();
  });

  it('offers no change to the only profile of a person: there is nothing to share with', async () => {
    vi.mocked(signInsApi.list).mockResolvedValue({
      data: [
        {
          profileId: 'p-1',
          username: 'ana',
          signIn: { ...main, shared: false },
        },
      ],
    } as never);
    renderWithProviders(<ProfileSignIns />);

    const row = (await screen.findByText('@ana')).closest('li')!;
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so, and lets the person try again, when the list cannot be loaded', async () => {
    vi.mocked(signInsApi.list).mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(<ProfileSignIns />);

    expect(
      await screen.findByText(i18n!.t('settings.signIns.load_failed')),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: i18n!.t('settings.profiles.retry') }),
    ).toBeVisible();
  });

  describe('giving a profile its own sign-in', () => {
    const fill = async (
      user: ReturnType<typeof userEvent.setup>,
      i18n: { t: (key: string) => string },
      values: { email?: string; password?: string; current?: string },
    ) => {
      const type = async (label: string, value?: string) => {
        if (value) await user.type(screen.getByLabelText(label), value);
      };
      await type(i18n.t('settings.signIns.own_form.email'), values.email);
      await type(i18n.t('settings.signIns.own_form.password'), values.password);
      await type(i18n.t('settings.signIns.current_password'), values.current);
      await user.click(
        screen.getByRole('button', {
          name: i18n.t('settings.signIns.own_form.submit'),
        }),
      );
    };

    it('says what will happen before it is done', async () => {
      const { i18n, dialog } = await open();
      for (const key of [
        'effect_new',
        'effect_others',
        'effect_notices',
        'effect_security',
      ]) {
        expect(
          within(dialog).getByText(i18n.t(`settings.signIns.own_form.${key}`)),
        ).toBeVisible();
      }
    });

    it('sends the new email and password with the current password, thanks and closes', async () => {
      vi.mocked(signInsApi.giveOwn).mockResolvedValue({
        data: withOwn,
      } as never);
      const { user, i18n } = await open();

      await fill(user, i18n, {
        email: ' shop@example.com ',
        password: 'New-Password-1',
        current: 'Current-Password-1',
      });

      await waitFor(() =>
        expect(signInsApi.giveOwn).toHaveBeenCalledWith(
          {
            profileId: 'p-2',
            email: 'shop@example.com',
            password: 'New-Password-1',
            currentPassword: 'Current-Password-1',
          },
          expect.anything(),
        ),
      );
      expect(toast.success).toHaveBeenCalledWith(
        i18n.t('settings.signIns.own_form.done', { username: 'ana.shop' }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    });

    it('asks for a valid email, a password of eight characters and the current password before sending', async () => {
      const { user, i18n } = await open();

      await fill(user, i18n, { email: 'not-an-email', password: 'short' });

      expect(
        screen.getByText(i18n.t('settings.signIns.own_form.email_invalid')),
      ).toBeVisible();
      expect(
        screen.getByText(i18n.t('settings.signIns.own_form.password_short')),
      ).toBeVisible();
      expect(
        screen.getByText(i18n.t('settings.signIns.current_password_required')),
      ).toBeVisible();
      expect(signInsApi.giveOwn).not.toHaveBeenCalled();
    });

    it.each([
      ['SIGN_IN_PROOF_INVALID'],
      ['SIGN_IN_EMAIL_TAKEN'],
      ['SIGN_IN_LIMIT_REACHED'],
    ])(
      'shows why it was refused (%s) in the language of the reader and keeps the form open',
      async (code) => {
        vi.mocked(signInsApi.giveOwn).mockRejectedValue(refused(code));
        const { user, i18n } = await open();

        await fill(user, i18n, {
          email: 'shop@example.com',
          password: 'New-Password-1',
          current: 'wrong',
        });

        expect(
          await screen.findByText(i18n.t(`settings.signIns.errors.${code}`)),
        ).toBeVisible();
        expect(screen.queryByText(/server text/)).not.toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeVisible();
        expect(toast.success).not.toHaveBeenCalled();
      },
    );
  });

  describe('going back to sharing', () => {
    it('says what stops working, offers the other sign-ins and sends the one chosen', async () => {
      vi.mocked(signInsApi.share).mockResolvedValue({ data: shared } as never);
      const { user, i18n, dialog } = await open(withOwn);

      expect(
        within(dialog).getByText(
          i18n.t('settings.signIns.share_form.effect_stops', {
            email: 'shop@example.com',
          }),
        ),
      ).toBeVisible();
      // Only the sign-ins of the other profiles, never its own.
      const target = within(dialog).getByLabelText(
        i18n.t('settings.signIns.share_form.target'),
      );
      expect(
        within(target)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['ana@example.com']);

      await user.type(
        screen.getByLabelText(i18n.t('settings.signIns.current_password')),
        'Current-Password-1',
      );
      await user.click(
        screen.getByRole('button', {
          name: i18n.t('settings.signIns.share_form.submit'),
        }),
      );

      await waitFor(() =>
        expect(signInsApi.share).toHaveBeenCalledWith(
          {
            profileId: 'p-2',
            signInId: 's-main',
            currentPassword: 'Current-Password-1',
          },
          expect.anything(),
        ),
      );
      expect(toast.success).toHaveBeenCalledWith(
        i18n.t('settings.signIns.share_form.done', { username: 'ana.shop' }),
      );
    });

    it('does not send without the current password', async () => {
      const { user, i18n } = await open(withOwn);

      await user.click(
        screen.getByRole('button', {
          name: i18n.t('settings.signIns.share_form.submit'),
        }),
      );

      expect(
        screen.getByText(i18n.t('settings.signIns.current_password_required')),
      ).toBeVisible();
      expect(signInsApi.share).not.toHaveBeenCalled();
    });
  });
});
