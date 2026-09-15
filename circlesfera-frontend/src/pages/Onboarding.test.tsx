import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi, usersApi } from '../services';
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
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      profile: { username: 'maya', avatar: null },
      setProfile: vi.fn(),
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
