import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi, profileApi, uploadApi, usersApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import Onboarding from './Onboarding';

vi.mock('../services', () => ({
  usersApi: {
    getSuggestions: vi.fn(),
    updateSettings: vi.fn(),
  },
  followsApi: {
    toggle: vi.fn(),
  },
  profileApi: {
    updateProfile: vi.fn(),
    getMyProfile: vi.fn(),
  },
  uploadApi: {
    upload: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../utils/nativeFilePicker', () => ({
  pickNativeImage: vi.fn().mockResolvedValue(false),
}));
const navigate = vi.hoisted(() => vi.fn());
const setProfile = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      profile: { username: 'maya', avatar: null },
      setProfile,
    }),
}));

const suggestedUsers = [
  {
    id: 'uuid-elena',
    username: 'ElenaTech',
    fullName: 'Elena',
    avatar: null,
    bio: null,
    followersCount: 12,
    reason: 'New creator',
    verificationLevel: 'BASIC' as const,
  },
  {
    id: 'uuid-circlesfera',
    username: 'CircleSfera',
    fullName: 'CircleSfera',
    avatar: null,
    bio: null,
    followersCount: 40,
    reason: 'New creator',
    verificationLevel: 'BUSINESS' as const,
  },
];

function renderOnboarding() {
  return renderWithProviders(<Onboarding />);
}

describe('Onboarding follow state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.getSuggestions).mockResolvedValue({
      data: suggestedUsers,
    } as Awaited<ReturnType<typeof usersApi.getSuggestions>>);
    vi.mocked(followsApi.toggle).mockResolvedValue({
      data: { following: true, status: 'ACCEPTED' },
    } as Awaited<ReturnType<typeof followsApi.toggle>>);
  });

  it('changes Follow to Following for the tapped user only', async () => {
    const { i18n } = renderOnboarding();

    fireEvent.click(screen.getByTestId('onboarding-continue'));

    const elenaFollow = await screen.findByTestId(
      'onboarding-follow-ElenaTech',
    );
    const otherFollow = screen.getByTestId('onboarding-follow-CircleSfera');

    expect(elenaFollow).toHaveTextContent(i18n!.t('onboarding.follow'));
    expect(otherFollow).toHaveTextContent(i18n!.t('onboarding.follow'));

    fireEvent.click(elenaFollow);

    await waitFor(() => {
      expect(elenaFollow).toHaveTextContent(i18n!.t('onboarding.following'));
    });
    expect(otherFollow).toHaveTextContent(
      new RegExp(`^${i18n!.t('onboarding.follow')}$`, 'i'),
    );
    expect(followsApi.toggle).toHaveBeenCalledWith('ElenaTech');
  });

  it('rolls the button back to Follow when the request fails', async () => {
    vi.mocked(followsApi.toggle).mockRejectedValueOnce(new Error('network'));
    const { i18n } = renderOnboarding();

    fireEvent.click(screen.getByTestId('onboarding-continue'));
    const elenaFollow = await screen.findByTestId(
      'onboarding-follow-ElenaTech',
    );
    fireEvent.click(elenaFollow);

    await waitFor(() => {
      expect(elenaFollow).toHaveTextContent(
        new RegExp(`^${i18n!.t('onboarding.follow')}$`, 'i'),
      );
    });
    expect(elenaFollow).not.toBeDisabled();
  });
});

describe('Onboarding empty suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.getSuggestions).mockResolvedValue({
      data: [],
    } as unknown as Awaited<ReturnType<typeof usersApi.getSuggestions>>);
  });

  it('shows where to find people and can refresh suggestions', async () => {
    const { i18n } = renderOnboarding();
    fireEvent.click(screen.getByTestId('onboarding-continue'));

    expect(
      await screen.findByTestId('onboarding-empty-suggestions'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('onboarding.empty_places_label')),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('nav.home'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('nav.explore'))).toBeInTheDocument();
    expect(screen.queryByText(/no suggestions yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('onboarding-retry-suggestions'));
    await waitFor(() => {
      expect(usersApi.getSuggestions).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Onboarding finish', () => {
  const photo = new File(['img'], 'me.png', { type: 'image/png' });
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(usersApi.getSuggestions).mockResolvedValue({
      data: [],
    } as unknown as Awaited<ReturnType<typeof usersApi.getSuggestions>>);
    vi.mocked(profileApi.updateProfile).mockResolvedValue({} as never);
    vi.mocked(usersApi.updateSettings).mockResolvedValue({} as never);
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p1', username: 'maya' },
    } as never);
  });
  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  async function finishWith(i18n: { t: (k: string) => string }, bio: string) {
    fireEvent.change(screen.getByLabelText(i18n.t('onboarding.bio_label')), {
      target: { value: bio },
    });
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    fireEvent.click(await screen.findByTestId('onboarding-enter'));
  }

  it('saves the bio and the chosen photo, marks onboarding done and goes home', async () => {
    vi.mocked(uploadApi.upload).mockResolvedValue({
      data: { url: 'https://cdn.example/me.png', type: 'image' },
    } as never);
    const { i18n } = renderOnboarding();

    fireEvent.change(
      screen.getByLabelText(i18n!.t('onboarding.change_avatar')),
      { target: { files: [photo] } },
    );
    expect(
      screen.getByAltText(i18n!.t('onboarding.avatar_alt')),
    ).toHaveAttribute('src', 'blob:preview');
    await finishWith(i18n!, 'Hola');

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    const sent = vi.mocked(uploadApi.upload).mock.calls[0][0] as FormData;
    expect(sent.get('file')).toBe(photo);
    expect(profileApi.updateProfile).toHaveBeenCalledWith({
      bio: 'Hola',
      avatar: 'https://cdn.example/me.png',
    });
    expect(usersApi.updateSettings).toHaveBeenCalledWith({
      isOnboarded: true,
    });
    expect(setProfile).toHaveBeenCalledWith({ id: 'p1', username: 'maya' });
    expect(toast.success).toHaveBeenCalled();
  });

  it('lets the account in without the photo when it cannot be uploaded, and says so', async () => {
    vi.mocked(uploadApi.upload).mockRejectedValue(new Error('too large'));
    const { i18n } = renderOnboarding();

    fireEvent.change(
      screen.getByLabelText(i18n!.t('onboarding.change_avatar')),
      { target: { files: [photo] } },
    );
    await finishWith(i18n!, 'Hola');

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(toast.error).toHaveBeenCalledWith(
      i18n!.t('onboarding.avatar_error'),
    );
    expect(profileApi.updateProfile).toHaveBeenCalledWith({ bio: 'Hola' });
  });

  it('does not upload anything when no photo was chosen', async () => {
    const { i18n } = renderOnboarding();

    await finishWith(i18n!, '');

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(uploadApi.upload).not.toHaveBeenCalled();
    expect(profileApi.updateProfile).toHaveBeenCalledWith({ bio: '' });
  });

  it('stays on onboarding when it cannot be saved', async () => {
    vi.mocked(usersApi.updateSettings).mockRejectedValue(new Error('down'));
    const { i18n } = renderOnboarding();

    await finishWith(i18n!, 'Hola');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(i18n!.t('onboarding.error')),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says so when the saved profile cannot be reloaded', async () => {
    vi.mocked(profileApi.getMyProfile).mockRejectedValue(new Error('down'));
    const { i18n } = renderOnboarding();

    await finishWith(i18n!, 'Hola');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('onboarding.reload_error'),
      ),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes back to the profile step', async () => {
    const { i18n } = renderOnboarding();
    fireEvent.click(screen.getByTestId('onboarding-continue'));

    fireEvent.click(
      await screen.findByRole('button', { name: i18n!.t('onboarding.back') }),
    );

    expect(
      screen.getByLabelText(i18n!.t('onboarding.bio_label')),
    ).toBeInTheDocument();
  });
});
