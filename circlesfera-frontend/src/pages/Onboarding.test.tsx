import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi, usersApi } from '../services';
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
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>
    </QueryClientProvider>,
  );
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
    renderOnboarding();

    fireEvent.click(screen.getByTestId('onboarding-continue'));

    const elenaFollow = await screen.findByTestId(
      'onboarding-follow-ElenaTech',
    );
    const otherFollow = screen.getByTestId('onboarding-follow-CircleSfera');

    expect(elenaFollow).toHaveTextContent(/follow/i);
    expect(otherFollow).toHaveTextContent(/follow/i);

    fireEvent.click(elenaFollow);

    await waitFor(() => {
      expect(elenaFollow).toHaveTextContent(/following/i);
    });
    expect(otherFollow).toHaveTextContent(/^follow$/i);
    expect(followsApi.toggle).toHaveBeenCalledWith('ElenaTech');
  });

  it('rolls the button back to Follow when the request fails', async () => {
    vi.mocked(followsApi.toggle).mockRejectedValueOnce(new Error('network'));
    renderOnboarding();

    fireEvent.click(screen.getByTestId('onboarding-continue'));
    const elenaFollow = await screen.findByTestId(
      'onboarding-follow-ElenaTech',
    );
    fireEvent.click(elenaFollow);

    await waitFor(() => {
      expect(elenaFollow).toHaveTextContent(/^follow$/i);
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
    renderOnboarding();
    fireEvent.click(screen.getByTestId('onboarding-continue'));

    expect(
      await screen.findByTestId('onboarding-empty-suggestions'),
    ).toBeInTheDocument();
    expect(screen.getByText(/where to find people/i)).toBeInTheDocument();
    expect(screen.getByText(/^home$/i)).toBeInTheDocument();
    expect(screen.getByText(/^explore$/i)).toBeInTheDocument();
    expect(screen.queryByText(/no suggestions yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('onboarding-retry-suggestions'));
    await waitFor(() => {
      expect(usersApi.getSuggestions).toHaveBeenCalledTimes(2);
    });
  });
});
