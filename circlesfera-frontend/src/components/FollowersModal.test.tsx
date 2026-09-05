import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import type { Profile } from '../types';
import FollowersModal from './FollowersModal';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const alice: Profile = {
  id: 'alice-1',
  userId: 'user-alice',
  username: 'alice',
  fullName: 'Alice Doe',
  bio: null,
  avatar: null,
  standardUrl: null,
  thumbnailUrl: null,
  website: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('FollowersModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the followers empty state and closes without navigating', () => {
    renderWithProviders(
      <FollowersModal title="followers" users={[]} onClose={onClose} />,
    );

    expect(screen.getByText('Followers')).toBeInTheDocument();
    expect(screen.getByText('No users found.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('uses the following title', () => {
    renderWithProviders(
      <FollowersModal title="following" users={[]} onClose={onClose} />,
    );

    expect(screen.getByText('Following')).toBeInTheDocument();
  });

  it('navigates to the profile and closes', () => {
    renderWithProviders(
      <FollowersModal title="followers" users={[alice]} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /alice/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/alice');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
