import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collaborationsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import CollaborationsSettings from './CollaborationsSettings';

vi.mock('../../services', () => ({
  collaborationsApi: {
    invitations: vi.fn(),
    accept: vi.fn(),
    leave: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(collaborationsApi);
const invitation = (id: string, username: string) => ({
  invitedAt: '2026-11-09T10:00:00.000Z',
  post: {
    id,
    type: 'POST',
    caption: `caption ${id}`,
    createdAt: '2026-11-09T09:00:00.000Z',
    profile: { id: username, username },
    media: [{ type: 'image', url: `/${id}.jpg`, thumbnailUrl: null }],
  },
});
const rowOf = (text: string) =>
  screen.getByText(text).closest('li') as HTMLElement;
const show = async (items: object[]) => {
  api.invitations.mockResolvedValue({ data: items } as never);
  const view = renderWithProviders(<CollaborationsSettings />);
  await waitFor(() => expect(api.invitations).toHaveBeenCalled());
  return view;
};

describe('CollaborationsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.accept.mockResolvedValue({} as never);
    api.leave.mockResolvedValue({} as never);
  });

  it('says so when nobody invited the Profile', async () => {
    await show([]);
    expect(
      await screen.findByText('No invitations at the moment'),
    ).toBeInTheDocument();
  });

  it('lists who invited, with a way to the post', async () => {
    await show([invitation('post-1', 'ana')]);
    await screen.findByText('ana invited you to collaborate');
    const row = rowOf('ana invited you to collaborate');
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/p/post-1');
    expect(within(row).getByText('caption post-1')).toBeInTheDocument();
  });

  it('accepts an invitation and asks for the list again', async () => {
    await show([invitation('post-1', 'ana'), invitation('post-2', 'leo')]);
    await screen.findByText('ana invited you to collaborate');

    api.invitations.mockResolvedValue({
      data: [invitation('post-2', 'leo')],
    } as never);
    fireEvent.click(
      within(rowOf('ana invited you to collaborate')).getByRole('button', {
        name: 'Accept',
      }),
    );

    await waitFor(() => expect(api.accept).toHaveBeenCalledWith('post-1'));
    await waitFor(() =>
      expect(
        screen.queryByText('ana invited you to collaborate'),
      ).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "You're now a collaborator on this post",
    );
  });

  it('declines an invitation', async () => {
    await show([invitation('post-1', 'ana')]);
    await screen.findByText('ana invited you to collaborate');
    fireEvent.click(
      within(rowOf('ana invited you to collaborate')).getByRole('button', {
        name: 'Decline',
      }),
    );
    await waitFor(() => expect(api.leave).toHaveBeenCalledWith('post-1'));
  });

  it('says when an invitation went away meanwhile', async () => {
    api.accept.mockRejectedValue({
      status: 404,
      data: { errorCode: 'COLLAB_NOT_FOUND' },
    });
    await show([invitation('post-1', 'ana')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This invitation is no longer available.',
      ),
    );
  });
});
