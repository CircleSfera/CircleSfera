import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collaborationsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import CollaboratorDialog from './CollaboratorDialog';

vi.mock('../../services', () => ({
  collaborationsApi: {
    get: vi.fn(),
    invite: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(collaborationsApi);
const bea = { id: 'bea', username: 'bea', avatar: null };
const show = () =>
  renderWithProviders(
    <CollaboratorDialog postId="post-1" isOpen onClose={vi.fn()} />,
  );

describe('CollaboratorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: null } as never);
    api.invite.mockResolvedValue({} as never);
    api.remove.mockResolvedValue({} as never);
  });

  it('invites one Profile by its username, with or without the @', async () => {
    const { queryClient } = show();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.change(await screen.findByLabelText('Username'), {
      target: { value: ' @bea ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() =>
      expect(api.invite).toHaveBeenCalledWith('post-1', 'bea'),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Invitation sent'),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['postCollaborator', 'post-1'],
    });
  });

  it('cannot invite nobody', async () => {
    show();
    expect(
      await screen.findByRole('button', { name: 'Invite' }),
    ).toBeDisabled();
  });

  it('says why an invitation was refused', async () => {
    api.invite.mockRejectedValue({
      status: 400,
      data: { errorCode: 'COLLAB_NOT_ALLOWED' },
    });
    show();
    fireEvent.change(await screen.findByLabelText('Username'), {
      target: { value: 'bea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Only a public post that is not paid can have a collaborator, and never its author.',
      ),
    );
  });

  it('shows an invitation waiting for an answer, which can be withdrawn', async () => {
    api.get.mockResolvedValue({
      data: { status: 'PENDING', profile: bea },
    } as never);
    show();

    expect(await screen.findByText('@bea')).toBeInTheDocument();
    expect(
      screen.getByText("Invited, hasn't answered yet"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('post-1'));
  });

  it('shows the co-author once accepted, who can be removed', async () => {
    api.get.mockResolvedValue({
      data: { status: 'ACCEPTED', profile: bea },
    } as never);
    show();

    expect(await screen.findByText('Co-author')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Collaborator removed'),
    );
  });
});
