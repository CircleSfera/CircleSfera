import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, uploadApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import type { ProfileWithUser } from '../../types';
import SupportTicketModal from './SupportTicketModal';

vi.mock('../../services', () => ({
  apiClient: {
    post: vi.fn(),
  },
  uploadApi: {
    upload: vi.fn(),
  },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const me: ProfileWithUser = {
  id: 'me-1',
  userId: 'user-me',
  username: 'me',
  fullName: 'Me',
  bio: null,
  avatar: null,
  standardUrl: null,
  thumbnailUrl: null,
  website: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  user: {
    id: 'user-me',
    email: 'me@circlesfera.test',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

function mockAuth(profile: ProfileWithUser | null = me) {
  vi.mocked(useAuthStore).mockImplementation((selector) =>
    selector({
      profile,
      isAuthenticated: !!profile,
      isCreatorModeActive: false,
      isSessionChecked: true,
      isCheckingSession: false,
      setCreatorMode: vi.fn(),
      setAuthenticated: vi.fn(),
      setProfile: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      checkSession: vi.fn().mockResolvedValue(undefined),
    }),
  );
}

function fillTicket() {
  fireEvent.change(screen.getByLabelText('Subject'), {
    target: { value: '  Charge failed  ' },
  });
  fireEvent.change(screen.getByLabelText('Detailed message'), {
    target: { value: '  Card was declined  ' },
  });
}

describe('SupportTicketModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(apiClient.post).mockResolvedValue({} as never);
    vi.mocked(uploadApi.upload).mockResolvedValue({
      data: { url: 'https://cdn.example.com/shot.png' },
    } as never);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <SupportTicketModal isOpen={false} onClose={onClose} />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('prefills the profile email and closes without sending', () => {
    renderWithProviders(<SupportTicketModal isOpen onClose={onClose} />);

    expect(screen.getByText('Help & Support')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('me@circlesfera.test');

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('does not post when subject or message is blank', () => {
    renderWithProviders(<SupportTicketModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /send ticket/i }));

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('posts a prefixed subject, trimmed body and identity', async () => {
    renderWithProviders(<SupportTicketModal isOpen onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'BILLING' },
    });
    fillTicket();
    fireEvent.click(screen.getByRole('button', { name: /send ticket/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/support/tickets', {
        email: 'me@circlesfera.test',
        subject: '[BILLING] Charge failed',
        message: 'Card was declined',
        userId: 'user-me',
      });
    });
    expect(await screen.findByText('Ticket sent!')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('appends the uploaded screenshot url to the message', async () => {
    renderWithProviders(<SupportTicketModal isOpen onClose={onClose} />);

    const file = new File(['png'], 'shot.png', { type: 'image/png' });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText('Screenshot attached ✓'),
    ).toBeInTheDocument();

    fillTicket();
    fireEvent.click(screen.getByRole('button', { name: /send ticket/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/support/tickets', {
        email: 'me@circlesfera.test',
        subject: '[TECHNICAL] Charge failed',
        message:
          'Card was declined\n\n📎 Attachment: https://cdn.example.com/shot.png',
        userId: 'user-me',
      });
    });
  });

  it('shows the server error without closing', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Rate limited'));

    renderWithProviders(<SupportTicketModal isOpen onClose={onClose} />);
    fillTicket();
    fireEvent.click(screen.getByRole('button', { name: /send ticket/i }));

    expect(await screen.findByText('Rate limited')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
