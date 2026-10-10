import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeAppLanguage } from '../../i18n';
import { profileApi } from '../../services';
import * as dataExportApi from '../../services/data-export.service';
import { usersApi } from '../../services/users.service';
import { renderWithProviders } from '../../test/test-utils';
import AccountSettings from './AccountSettings';

const session = { logout: vi.fn() };

vi.mock('../../services', () => ({
  profileApi: { getMyProfile: vi.fn(), deactivateAccount: vi.fn() },
}));
vi.mock('../../services/data-export.service', () => ({
  getLatestDataExport: vi.fn(),
  requestDataExport: vi.fn(),
}));
vi.mock('../../services/users.service', () => ({
  usersApi: {
    syncIdentitySession: vi.fn(),
    createIdentitySession: vi.fn(),
    scheduleDeletion: vi.fn(),
    cancelScheduledDeletion: vi.fn(),
  },
}));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ logout: session.logout }),
}));
vi.mock('../../i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../i18n')>()),
  changeAppLanguage: vi.fn(),
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../profile/AboutAccountDialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../profile/AboutAccountDialog')>()),
  default: ({
    isOpen,
    onClose,
    account,
  }: {
    isOpen: boolean;
    onClose: () => void;
    account: { username: string };
  }) =>
    isOpen ? (
      <div data-testid="about">
        about @{account.username}
        <button type="button" onClick={onClose}>
          close about
        </button>
      </div>
    ) : null,
}));

const profiles = vi.mocked(profileApi);
const exportsApi = vi.mocked(dataExportApi);
const users = vi.mocked(usersApi);
const language = vi.mocked(changeAppLanguage);

const mine = (over: object = {}) => ({
  id: 'p-1',
  username: 'ana',
  fullName: 'Ana Ruiz',
  identityVerifiedAt: '2026-01-10T10:00:00Z',
  ...over,
});
const exported = (over: object = {}) => ({
  id: 'e-1',
  userId: 'u-1',
  status: 'COMPLETED',
  expiresAt: null,
  url: 'https://files.test/export.zip',
  createdAt: '2026-03-01T10:00:00Z',
  updatedAt: '2026-03-01T10:05:00Z',
  ...over,
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}</output>;
}
const show = async (profile: object | null = mine()) => {
  profiles.getMyProfile.mockResolvedValue({ data: profile } as never);
  const view = renderWithProviders(
    <>
      <AccountSettings />
      <Where />
    </>,
  );
  await waitFor(() => expect(profiles.getMyProfile).toHaveBeenCalled());
  await screen.findByText('Identity verification');
  return view;
};
const zone = (title: string) =>
  screen
    .getByRole('heading', { name: title })
    .closest('.rounded-xl') as HTMLElement;
const confirmIn = async (title: string, label: string) => {
  fireEvent.click(within(zone(title)).getByRole('button', { name: label }));
  const dialog = await screen.findByRole('dialog');
  return dialog;
};

describe('AccountSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportsApi.getLatestDataExport.mockResolvedValue(null as never);
    exportsApi.requestDataExport.mockResolvedValue(exported() as never);
    users.syncIdentitySession.mockResolvedValue({ status: 'pending' });
    users.createIdentitySession.mockResolvedValue({
      url: 'https://identity.test/session',
    });
    users.scheduleDeletion.mockResolvedValue({} as never);
    users.cancelScheduledDeletion.mockResolvedValue({} as never);
    profiles.deactivateAccount.mockResolvedValue({} as never);
    language.mockResolvedValue(undefined as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens what is known about the account', async () => {
    await show();

    expect(screen.queryByTestId('about')).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: /About this account/ }),
    );
    expect(screen.getByTestId('about')).toHaveTextContent('about @ana');
    fireEvent.click(screen.getByRole('button', { name: 'close about' }));
    expect(screen.queryByTestId('about')).not.toBeInTheDocument();
  });

  it('offers nothing about the account while there is no profile', async () => {
    await show(null);

    expect(
      screen.queryByRole('button', { name: /About this account/ }),
    ).not.toBeInTheDocument();
  });

  it('marks the language in use and changes it', async () => {
    await show();

    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const spanish = screen.getByRole('button', { name: 'Español' });
    expect(spanish).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(spanish);
    expect(language).toHaveBeenCalledWith('es');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(language).toHaveBeenLastCalledWith('en');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says so when the language could not be changed', async () => {
    language.mockRejectedValue(new Error('offline'));
    await show();

    fireEvent.click(screen.getByRole('button', { name: 'Español' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not change the language. Check your connection and try again.',
      ),
    );
  });

  it('shows a verified identity and asks the provider nothing', async () => {
    await show();

    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(
      screen.getByText('Your identity has been successfully verified.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Verify identity' }),
    ).not.toBeInTheDocument();
    expect(users.syncIdentitySession).not.toHaveBeenCalled();
  });

  it('starts the identity check and goes to the provider', async () => {
    const place = { origin: 'https://app.test', href: 'https://app.test/x' };
    vi.stubGlobal('location', place);
    await show(mine({ identityVerifiedAt: null }));

    fireEvent.click(screen.getByRole('button', { name: 'Verify identity' }));
    await waitFor(() =>
      expect(users.createIdentitySession).toHaveBeenCalledWith(
        'https://app.test/accounts/account',
      ),
    );
    await waitFor(() =>
      expect(place.href).toBe('https://identity.test/session'),
    );
  });

  it('says so when the identity check could not be started', async () => {
    users.createIdentitySession.mockRejectedValue(new Error('no'));
    await show(mine({ identityVerifiedAt: null }));

    fireEvent.click(screen.getByRole('button', { name: 'Verify identity' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to initialize verification session',
      ),
    );
  });

  it('picks up a check finished elsewhere, and stays quiet when it is not or cannot be read', async () => {
    users.syncIdentitySession.mockResolvedValue({ status: 'verified' });
    const first = await show(mine({ identityVerifiedAt: null }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Your identity has been verified!',
      ),
    );
    await waitFor(() =>
      expect(profiles.getMyProfile.mock.calls.length).toBeGreaterThan(1),
    );
    first.unmount();

    vi.clearAllMocks();
    users.syncIdentitySession.mockResolvedValue({ status: 'pending' });
    const second = await show(mine({ identityVerifiedAt: null }));
    await waitFor(() => expect(users.syncIdentitySession).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    second.unmount();

    vi.clearAllMocks();
    users.syncIdentitySession.mockRejectedValue(new Error('down'));
    await show(mine({ identityVerifiedAt: null }));
    await waitFor(() => expect(users.syncIdentitySession).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('requests a copy of the data', async () => {
    await show();

    fireEvent.click(screen.getByRole('button', { name: 'Request export' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Export request created. We will notify you when it is ready.',
      ),
    );
    await waitFor(() =>
      expect(exportsApi.getLatestDataExport).toHaveBeenCalledTimes(2),
    );
  });

  it('says why a copy could not be requested', async () => {
    exportsApi.requestDataExport.mockRejectedValue({ status: 400, data: {} });
    await show();

    fireEvent.click(screen.getByRole('button', { name: 'Request export' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to request data export.',
      ),
    );
  });

  it('says a copy is being prepared, and offers nothing else meanwhile', async () => {
    exportsApi.getLatestDataExport.mockResolvedValue(
      exported({ status: 'PENDING', url: null }) as never,
    );
    await show();

    expect(
      await screen.findByText('Processing your request…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request export' }),
    ).not.toBeInTheDocument();
  });

  it('offers a finished copy to download, and a new one', async () => {
    exportsApi.getLatestDataExport.mockResolvedValue(exported() as never);
    await show();

    const download = await screen.findByRole('link', { name: 'Download data' });
    expect(download).toHaveAttribute('href', 'https://files.test/export.zip');
    expect(download).toHaveAttribute('target', '_blank');
    expect(download).toHaveAttribute('rel', 'noreferrer');

    fireEvent.click(
      screen.getByRole('button', { name: 'Request a new export' }),
    );
    await waitFor(() =>
      expect(exportsApi.requestDataExport).toHaveBeenCalled(),
    );
  });

  it.each([
    ['a failed copy', exported({ status: 'FAILED', url: null })],
    ['a finished copy with no file', exported({ url: null })],
  ])('offers to request again after %s', async (_name, latest) => {
    exportsApi.getLatestDataExport.mockResolvedValue(latest as never);
    await show();

    expect(
      await screen.findByRole('button', { name: 'Request export' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download data' })).toBeNull();
  });

  it('deactivates the account only after confirming, then signs out', async () => {
    await show();

    const asked = await confirmIn('Deactivate account', 'Deactivate account');
    expect(
      within(asked).getByText(
        'Are you sure you want to deactivate your account? You can reactivate it by logging in again.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(asked).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(profiles.deactivateAccount).not.toHaveBeenCalled();

    const again = await confirmIn('Deactivate account', 'Deactivate account');
    fireEvent.click(
      within(again).getByRole('button', { name: 'Deactivate account' }),
    );
    await waitFor(() => expect(profiles.deactivateAccount).toHaveBeenCalled());
    await waitFor(() => expect(session.logout).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('where')).toHaveTextContent('/accounts/login');
  });

  it('stays signed in when the account could not be deactivated', async () => {
    profiles.deactivateAccount.mockRejectedValue(new Error('no'));
    await show();

    const asked = await confirmIn('Deactivate account', 'Deactivate account');
    fireEvent.click(
      within(asked).getByRole('button', { name: 'Deactivate account' }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not deactivate account'),
    );
    expect(session.logout).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('schedules the deletion only after confirming, then signs out', async () => {
    await show();

    const asked = await confirmIn('Delete account', 'Delete account');
    expect(
      within(asked).getByText(
        'Schedule permanent deletion? You can restore by logging in within 30 days.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(asked).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(users.scheduleDeletion).not.toHaveBeenCalled();

    const again = await confirmIn('Delete account', 'Delete account');
    fireEvent.click(
      within(again).getByRole('button', { name: 'Delete account' }),
    );
    await waitFor(() => expect(users.scheduleDeletion).toHaveBeenCalled());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Account scheduled for deletion. Log in within 30 days to restore it.',
      ),
    );
    expect(session.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('where')).toHaveTextContent('/accounts/login');
  });

  it('says so and stays signed in when the deletion could not be scheduled', async () => {
    users.scheduleDeletion.mockRejectedValue({ status: 400, data: {} });
    await show();

    const asked = await confirmIn('Delete account', 'Delete account');
    fireEvent.click(
      within(asked).getByRole('button', { name: 'Delete account' }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The account could not be scheduled for deletion. Nothing has changed.',
      ),
    );
    expect(session.logout).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('cancels a scheduled deletion, and says so when it cannot', async () => {
    await show();

    const cancel = screen.getByRole('button', {
      name: 'Cancel scheduled deletion',
    });
    fireEvent.click(cancel);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Account deletion cancelled. Your account is active again.',
      ),
    );

    users.cancelScheduledDeletion.mockRejectedValue(new Error('no'));
    fireEvent.click(cancel);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not cancel deletion. Try logging in again within the grace period.',
      ),
    );
    expect(session.logout).not.toHaveBeenCalled();
  });
});
