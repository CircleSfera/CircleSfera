import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import type { Conversation, Participant, ProfileWithUser } from '../../types';
import GroupDetailsModal from './GroupDetailsModal';

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
};

const bob: ProfileWithUser = {
  ...me,
  id: 'bob-1',
  userId: 'user-bob',
  username: 'bob',
  fullName: 'Bob',
};

function participant(profile: ProfileWithUser, isAdmin = false): Participant {
  return {
    id: `part-${profile.id}`,
    profileId: profile.id,
    isAdmin,
    profile,
  };
}

function group(isMeAdmin: boolean): Conversation {
  return {
    id: 'conv-group',
    isGroup: true,
    name: 'Weekend',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    participants: [participant(me, isMeAdmin), participant(bob, !isMeAdmin)],
  };
}

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

describe('GroupDetailsModal', () => {
  const onClose = vi.fn();
  const onUpdate = vi.fn();
  const onRemoveParticipant = vi.fn();
  const onLeaveGroup = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  function renderModal(conversation: Conversation, isOpen = true) {
    return renderWithProviders(
      <GroupDetailsModal
        isOpen={isOpen}
        conversation={conversation}
        onClose={onClose}
        onUpdate={onUpdate}
        onRemoveParticipant={onRemoveParticipant}
        onLeaveGroup={onLeaveGroup}
      />,
    );
  }

  it('renders nothing when closed', () => {
    renderModal(group(true), false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the group name, members and participants', () => {
    renderModal(group(false));

    expect(screen.getByText('Group details')).toBeInTheDocument();
    expect(screen.getByText('Weekend')).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit info' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle('Remove from group')).not.toBeInTheDocument();
  });

  it('closes from the dialog X without mutating the group', () => {
    renderModal(group(true));

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onRemoveParticipant).not.toHaveBeenCalled();
    expect(onLeaveGroup).not.toHaveBeenCalled();
  });

  it('lets an admin save a new name and avatar url', () => {
    renderModal(group(true));

    fireEvent.click(screen.getByRole('button', { name: 'Edit info' }));
    fireEvent.change(screen.getByLabelText('Group name'), {
      target: { value: 'Saturday' },
    });
    fireEvent.change(screen.getByLabelText('Avatar image URL (optional)'), {
      target: { value: 'https://cdn.example/group.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdate).toHaveBeenCalledWith({
      name: 'Saturday',
      avatarUrl: 'https://cdn.example/group.png',
    });
  });

  it('cancels edit without saving', () => {
    renderModal(group(true));

    fireEvent.click(screen.getByRole('button', { name: 'Edit info' }));
    fireEvent.change(screen.getByLabelText('Group name'), {
      target: { value: 'Nope' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Weekend')).toBeInTheDocument();
  });

  it('removes another member only after confirm', () => {
    renderModal(group(true));

    fireEvent.click(screen.getByTitle('Remove from group'));

    expect(window.confirm).toHaveBeenCalledWith('Remove @bob from this group?');
    expect(onRemoveParticipant).toHaveBeenCalledWith('bob-1');
  });

  it('does not remove when confirm is cancelled', () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    renderModal(group(true));

    fireEvent.click(screen.getByTitle('Remove from group'));

    expect(onRemoveParticipant).not.toHaveBeenCalled();
  });

  it('leaves the group after confirm', () => {
    renderModal(group(false));

    fireEvent.click(screen.getByRole('button', { name: /leave group/i }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Leave this group? You will stop receiving new messages.',
    );
    expect(onLeaveGroup).toHaveBeenCalledTimes(1);
  });
});
