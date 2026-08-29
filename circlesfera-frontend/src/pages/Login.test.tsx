import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, profileApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import Login from './Login';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../services', () => ({
  authApi: { login: vi.fn() },
  profileApi: { getMyProfile: vi.fn() },
  passkeyApi: {
    getLoginOptions: vi.fn(),
    verifyLogin: vi.fn(),
  },
}));

vi.mock('../services/socketStore', () => ({
  useSocketStore: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    socket: null,
  })),
}));

vi.mock('../utils/visitorId', () => ({
  getVisitorId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../components/auth/TurnstileWidget', () => ({
  default: () => null,
}));

describe('Login Page Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.mocked(authApi.login).mockResolvedValue({ data: {} } as never);
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: {
        id: 'profile-1',
        username: 'testuser',
        fullName: 'Test User',
      },
    } as never);
  });

  it('renders login form correctly', () => {
    renderWithProviders(<Login />);

    expect(screen.getByLabelText(/email or username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-button')).toBeInTheDocument();
  });

  it('handles successful login via authApi and loads profile', async () => {
    renderWithProviders(<Login />);

    fireEvent.change(screen.getByLabelText(/email or username/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'test@example.com',
          password: 'password123',
        }),
      );
    });

    await waitFor(() => {
      expect(profileApi.getMyProfile).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('displays error on failed login', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { message: 'Invalid credentials' } },
    });

    renderWithProviders(<Login />);

    fireEvent.change(screen.getByLabelText(/email or username/i), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });
});
