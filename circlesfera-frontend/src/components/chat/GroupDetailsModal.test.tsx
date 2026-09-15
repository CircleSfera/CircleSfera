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
    const { i18n } = renderModal(group(false));

    expect(
      screen.getByText(i18n!.t('chat.group_details.title')),
    ).toBeInTheDocument();
    expect(screen.getByText('Weekend')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('chat.members', { count: 2 })),
    ).toBeInTheDocument();
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('chat.group_details.admin_badge')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('chat.group_details.edit_info'),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTitle(i18n!.t('chat.group_details.remove_title')),
    ).not.toBeInTheDocument();
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
    const { i18n } = renderModal(group(true));

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('chat.group_details.edit_info'),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('chat.group_details.name_label')),
      {
        target: { value: 'Saturday' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('chat.group_details.avatar_label')),
      {
        target: { value: 'https://cdn.example/group.png' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('chat.group_details.save') }),
    );

    expect(onUpdate).toHaveBeenCalledWith({
      name: 'Saturday',
      avatarUrl: 'https://cdn.example/group.png',
    });
  });

  it('cancels edit without saving', () => {
    const { i18n } = renderModal(group(true));

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('chat.group_details.edit_info'),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('chat.group_details.name_label')),
      {
        target: { value: 'Nope' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('chat.cancel') }),
    );

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Weekend')).toBeInTheDocument();
  });

  it('removes another member only after confirm', () => {
    const { i18n } = renderModal(group(true));

    fireEvent.click(
      screen.getByTitle(i18n!.t('chat.group_details.remove_title')),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      i18n!.t('chat.group_details.remove_confirm', { username: 'bob' }),
    );
    expect(onRemoveParticipant).toHaveBeenCalledWith('bob-1');
  });

  it('does not remove when confirm is cancelled', () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    const { i18n } = renderModal(group(true));

    fireEvent.click(
      screen.getByTitle(i18n!.t('chat.group_details.remove_title')),
    );

    expect(onRemoveParticipant).not.toHaveBeenCalled();
  });

  it('leaves the group after confirm', () => {
    const { i18n } = renderModal(group(false));

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('chat.group_details.leave_group'),
      }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      i18n!.t('chat.group_details.leave_confirm'),
    );
    expect(onLeaveGroup).toHaveBeenCalledTimes(1);
  });
});
