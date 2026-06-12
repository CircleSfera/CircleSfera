import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/api';
import Login from './Login';

// Create a client for testing
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

// Mock the API client
vi.mock('../services/api', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('../services/socketStore', () => ({
  useSocketStore: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    socket: null,
  })),
}));

// Mock useNavigate from react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Login Page Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('renders login form correctly', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText(/email or username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-button')).toBeInTheDocument();
  });

  it('handles successful login', async () => {
    // Mock successful response
    const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValueOnce({
      data: {
        accessToken: 'fake-token',
        user: { id: '1', name: 'Test User' },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Fill form
    fireEvent.change(screen.getByLabelText(/email or username/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });

    // Submit
    fireEvent.click(screen.getByTestId('login-submit-button'));

    // Assert API call
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        identifier: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('displays error on failed login', async () => {
    // Mock error response
    const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
    mockPost.mockRejectedValueOnce({
      response: {
        data: {
          message: 'Invalid credentials',
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Fill form
    fireEvent.change(screen.getByLabelText(/email or username/i), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpass' },
    });

    // Submit
    fireEvent.click(screen.getByTestId('login-submit-button'));

    // Assert Error Message
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });
});
