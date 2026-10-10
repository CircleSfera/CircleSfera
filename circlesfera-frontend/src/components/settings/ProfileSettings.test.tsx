import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, profileApi, uploadApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import ProfileSettings from './ProfileSettings';

const device = { native: false, biometric: true as boolean | 'fails' };
const security = { enabled: false, set: vi.fn() };
const session = { setProfile: vi.fn() };
const picker = { handled: false, pick: vi.fn() };

vi.mock('../../services', () => ({
  authApi: { resendVerification: vi.fn() },
  profileApi: {
    getMyProfile: vi.fn(),
    updateProfile: vi.fn(),
    checkUsername: vi.fn(),
  },
  uploadApi: { upload: vi.fn() },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => device.native },
}));
vi.mock('@capgo/capacitor-native-biometric', () => ({
  NativeBiometric: {
    isAvailable: () =>
      device.biometric === 'fails'
        ? Promise.reject(new Error('no sensor'))
        : Promise.resolve({ isAvailable: device.biometric }),
  },
}));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ setProfile: session.setProfile }),
}));
vi.mock('../../stores/securityStore', () => ({
  useSecurityStore: (selector: (s: unknown) => unknown) =>
    selector({
      isBiometricEnabled: security.enabled,
      setBiometricEnabled: security.set,
    }),
}));
vi.mock('../../utils/nativeFilePicker', () => ({
  pickNativeImage: (...args: unknown[]) => {
    picker.pick(...args);
    return Promise.resolve(picker.handled);
  },
}));
vi.mock('../../hooks/useDebounce', () => ({
  useDebounce: <T,>(callback: T) => callback,
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const api = { auth: vi.mocked(authApi), profile: vi.mocked(profileApi) };
const upload = vi.mocked(uploadApi);

const mine = (over: object = {}) => ({
  id: 'p-1',
  username: 'ana',
  fullName: 'Ana Ruiz',
  bio: 'Photographer',
  website: 'https://ana.example',
  accountType: 'PERSONAL',
  accentColor: null,
  avatar: null,
  verificationLevel: 'BASIC',
  emailConfirmed: true,
  companyVerified: false,
  ...over,
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}</output>;
}
const show = async (profile: object = mine()) => {
  api.profile.getMyProfile.mockResolvedValue({ data: profile } as never);
  const view = renderWithProviders(
    <>
      <ProfileSettings />
      <Where />
    </>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Display Name')).toHaveValue(
      (profile as { fullName: string }).fullName,
    ),
  );
  return view;
};
const save = () => screen.getByRole('button', { name: 'Save Profile Changes' });
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;
const choose = (file = new File(['x'], 'me.png', { type: 'image/png' })) =>
  fireEvent.change(fileInput(), { target: { files: [file] } });

describe('ProfileSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    device.native = false;
    device.biometric = true;
    security.enabled = false;
    picker.handled = false;
    api.profile.updateProfile.mockImplementation(((data: object) =>
      Promise.resolve({ data: { ...mine(), ...data } })) as never);
    api.profile.checkUsername.mockResolvedValue({
      data: { available: true },
    } as never);
    api.auth.resendVerification.mockResolvedValue({} as never);
    upload.upload.mockResolvedValue({
      data: { url: 'https://cdn.test/new.jpg' },
    } as never);
  });

  it('fills the form with the profile, with nothing to save yet', async () => {
    await show();

    expect(screen.getByLabelText('Username')).toHaveValue('ana');
    expect(screen.getByLabelText('Bio')).toHaveValue('Photographer');
    expect(screen.getByLabelText('Website')).toHaveValue('https://ana.example');
    expect(screen.getByText('12/150')).toBeInTheDocument();
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(screen.queryByText('Email not verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Company')).not.toBeInTheDocument();
    expect(screen.queryByText('Biometric Lock')).not.toBeInTheDocument();
  });

  it('saves the changed name, bio and site, and says so', async () => {
    await show();

    type('Display Name', 'Ana R.');
    type('Bio', 'New words');
    type('Website', 'https://new.example');
    expect(save()).toBeEnabled();
    fireEvent.click(save());

    await waitFor(() =>
      expect(api.profile.updateProfile).toHaveBeenCalledWith({
        fullName: 'Ana R.',
        bio: 'New words',
        accountType: 'PERSONAL',
        website: 'https://new.example',
      }),
    );
    expect(
      await screen.findByText('Profile Updated Successfully'),
    ).toBeInTheDocument();
    expect(session.setProfile).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Ana R.' }),
    );
    await waitFor(() => expect(save()).toBeDisabled());
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('sends no site when it is emptied or only spaces', async () => {
    await show();

    type('Website', '   ');
    fireEvent.click(save());

    await waitFor(() =>
      expect(api.profile.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ website: null }),
      ),
    );
  });

  it('warns when the bio is near its limit', async () => {
    await show();

    type('Bio', 'a'.repeat(139));
    expect(screen.getByText('139/150')).toHaveClass('text-white/40');
    type('Bio', 'a'.repeat(140));
    expect(screen.getByText('140/150')).toHaveClass('text-brand-secondary');
  });

  it('checks a new username, drops what it cannot hold, and moves to the new address once saved', async () => {
    await show();

    type('Username', 'ana ruiz!');
    expect(screen.getByLabelText('Username')).toHaveValue('anaruiz');
    await waitFor(() =>
      expect(api.profile.checkUsername).toHaveBeenCalledWith('anaruiz'),
    );
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());

    await waitFor(() =>
      expect(api.profile.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'anaruiz' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/anaruiz'),
    );
  });

  it('does not save a username that is taken, too short or could not be checked', async () => {
    await show();

    api.profile.checkUsername.mockResolvedValue({
      data: { available: false },
    } as never);
    type('Username', 'eva');
    expect(
      await screen.findByText('@eva is already taken.'),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();

    type('Username', 'ev');
    expect(
      await screen.findByText('Username must be at least 3 characters'),
    ).toBeInTheDocument();
    expect(api.profile.checkUsername).toHaveBeenCalledTimes(1);
    expect(save()).toBeDisabled();

    api.profile.checkUsername.mockRejectedValue(new Error('no'));
    type('Username', 'evaa');
    expect(
      await screen.findByText('Error checking username'),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();

    // Back to its own name: nothing to check, nothing to save.
    type('Username', 'ana');
    await waitFor(() =>
      expect(
        screen.queryByText('Error checking username'),
      ).not.toBeInTheDocument(),
    );
    expect(save()).toBeDisabled();
  });

  it('says a refused name is not valid when the reason is its shape', async () => {
    await show();
    api.profile.checkUsername.mockResolvedValue({
      data: { available: false },
    } as never);

    type('Username', 'a'.repeat(31));
    expect(
      await screen.findByText(
        'Use 3–30 letters, numbers, dots or underscores.',
      ),
    ).toBeInTheDocument();
  });

  it('says why saving failed and keeps what was typed', async () => {
    api.profile.updateProfile.mockRejectedValue({ status: 400, data: {} });
    await show();

    type('Display Name', 'Ana R.');
    fireEvent.click(save());

    expect(
      await screen.findByText('Could not save changes'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toHaveValue('Ana R.');
    expect(session.setProfile).not.toHaveBeenCalled();
  });

  it('changes the account type', async () => {
    await show();

    fireEvent.click(screen.getByRole('button', { name: /Creator/ }));
    fireEvent.click(save());

    await waitFor(() =>
      expect(api.profile.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ accountType: 'CREATOR' }),
      ),
    );
  });

  it('keeps the profile colour for the plans that include it', async () => {
    await show();

    const colours = screen.getByRole('radiogroup', { name: 'Profile colour' });
    expect(
      within(colours).getByRole('radio', { name: 'CircleSfera purple' }),
    ).toBeChecked();
    expect(within(colours).getByRole('radio', { name: 'Blue' })).toBeDisabled();
    expect(
      screen.getByText(
        'The profile colour comes with the Elite Creator and Business plans.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );

    // Saving something else sends no colour at all.
    type('Display Name', 'Ana R.');
    fireEvent.click(save());
    await waitFor(() => expect(api.profile.updateProfile).toHaveBeenCalled());
    expect(api.profile.updateProfile.mock.calls[0][0]).not.toHaveProperty(
      'accentColor',
    );
  });

  it('chooses a colour, and goes back to the one of the app', async () => {
    await show(mine({ verificationLevel: 'ELITE', accentColor: 'teal' }));

    const colours = screen.getByRole('radiogroup', { name: 'Profile colour' });
    expect(within(colours).getByRole('radio', { name: 'Teal' })).toBeChecked();
    expect(screen.queryByRole('link', { name: 'See plans' })).toBeNull();

    fireEvent.click(within(colours).getByRole('radio', { name: 'Pink' }));
    expect(within(colours).getByRole('radio', { name: 'Pink' })).toBeChecked();
    fireEvent.click(save());
    await waitFor(() =>
      expect(api.profile.updateProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({ accentColor: 'pink' }),
      ),
    );

    fireEvent.click(
      within(colours).getByRole('radio', { name: 'CircleSfera purple' }),
    );
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    await waitFor(() =>
      expect(api.profile.updateProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({ accentColor: null }),
      ),
    );
  });

  it('offers a business to verify its company, or shows that it is verified', async () => {
    const first = await show(mine({ verificationLevel: 'BUSINESS' }));
    expect(
      screen.getByRole('link', { name: 'Verify company' }),
    ).toHaveAttribute('href', '/creator/monetization');
    first.unmount();

    await show(mine({ verificationLevel: 'BUSINESS', companyVerified: true }));
    expect(screen.getByText('Verified company')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verify company' })).toBeNull();
  });

  it('does not save while the email is unverified, and sends the email again once', async () => {
    await show(mine({ emailConfirmed: false }));

    expect(screen.getByText('Email not verified')).toBeInTheDocument();
    type('Display Name', 'Ana R.');
    expect(save()).toBeDisabled();
    fireEvent.submit(save().closest('form') as HTMLFormElement);
    expect(api.profile.updateProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    const sent = await screen.findByRole('button', { name: 'Sent!' });
    expect(sent).toBeDisabled();
    expect(api.auth.resendVerification).toHaveBeenCalledTimes(1);
  });

  it('uploads a new picture and shows it at once', async () => {
    await show();

    fireEvent.click(screen.getByRole('button', { name: 'Upload New' }));
    await waitFor(() => expect(picker.pick).toHaveBeenCalledTimes(1));
    choose();

    await waitFor(() =>
      expect(api.profile.updateProfile).toHaveBeenCalledWith({
        avatar: 'https://cdn.test/new.jpg',
      }),
    );
    const sent = upload.upload.mock.calls[0][0] as FormData;
    expect((sent.get('file') as File).name).toBe('me.png');
    await waitFor(() =>
      expect(session.setProfile).toHaveBeenCalledWith(
        expect.objectContaining({ avatar: 'https://cdn.test/new.jpg' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload New' })).toBeEnabled(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The chosen picture itself, as read from the device.
    expect(
      screen
        .getByRole('button', { name: 'Change' })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toMatch(/^data:image\/png;base64,/);
  });

  it('says so when the picture could not be uploaded, until the next try', async () => {
    upload.upload.mockRejectedValueOnce(new Error('too big'));
    await show();

    choose();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The picture could not be uploaded. Try again.',
    );
    // The field is left empty, so choosing the same picture counts again.
    expect(fileInput().value).toBe('');
    expect(api.profile.updateProfile).not.toHaveBeenCalled();
    expect(session.setProfile).not.toHaveBeenCalled();
    // The picture that was not saved is not left on show.
    expect(
      screen
        .getByRole('button', { name: 'Change' })
        .querySelector('img[src^="data:image/png"]'),
    ).toBeNull();

    choose();
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(api.profile.updateProfile).toHaveBeenCalled());
  });

  it('does nothing when no picture is chosen, and leaves the choice to the device when it handles it', async () => {
    picker.handled = true;
    await show();
    // Inside a button, opening the file dialog would press that button
    // again, and it would never open.
    expect(fileInput().closest('button')).toBeNull();
    const opened = vi.spyOn(fileInput(), 'click');

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(picker.pick).toHaveBeenCalledTimes(1));
    expect(opened).not.toHaveBeenCalled();

    picker.handled = false;
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));

    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(upload.upload).not.toHaveBeenCalled();
  });

  it('offers the biometric lock only on a device that has it', async () => {
    device.native = true;
    const first = await show();
    const lock = await screen.findByRole('switch', { name: 'Biometric Lock' });
    expect(lock).not.toBeChecked();
    fireEvent.click(lock);
    expect(security.set).toHaveBeenCalledWith(true);
    first.unmount();

    security.enabled = true;
    const second = await show();
    const on = await screen.findByRole('switch', { name: 'Biometric Lock' });
    expect(on).toBeChecked();
    fireEvent.click(on);
    expect(security.set).toHaveBeenLastCalledWith(false);
    second.unmount();

    device.biometric = false;
    const third = await show();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    third.unmount();

    device.biometric = 'fails';
    await show();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
