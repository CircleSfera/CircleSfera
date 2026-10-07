import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chatApi,
  followsApi,
  highlightsApi,
  postsApi,
  profileApi,
  storiesApi,
} from '../services';
import { renderWithProviders } from '../test/test-utils';
import Profile from './Profile';

vi.mock('../services', () => ({
  profileApi: { getProfile: vi.fn(), getMyProfile: vi.fn() },
  followsApi: { check: vi.fn(), getFollowers: vi.fn(), getFollowing: vi.fn() },
  postsApi: { getByUser: vi.fn(), getTagged: vi.fn() },
  storiesApi: { getByUser: vi.fn() },
  highlightsApi: { getProfileHighlights: vi.fn() },
  bookmarksApi: { getAll: vi.fn(), getCollections: vi.fn() },
  chatApi: { createGroup: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: t, toast: t };
});
vi.mock('../components/common/SEO', () => ({ default: () => null }));
vi.mock('../components/profile/ProfileHeader', () => ({
  default: (props: { handleMessageClick: () => void; isMe: boolean }) => (
    <div>
      <span>{props.isMe ? 'own header' : 'other header'}</span>
      <button type="button" onClick={props.handleMessageClick}>
        message
      </button>
    </div>
  ),
}));
vi.mock('../components/profile/PostGrid', () => ({
  default: ({ items }: { items: { id: string }[] }) => (
    <div>grid:{items.map((i) => i.id).join(',')}</div>
  ),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const profileOf = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: 'prof-ana',
    userId: 'user-ana',
    username: 'ana',
    isPrivate: false,
    user: { settings: { privacyLevel: 'PUBLIC' } },
    ...overrides,
  },
});
const postsPage = {
  data: { data: [{ id: 'post-1' }], meta: { page: 1, totalPages: 1 } },
};

function renderAt(path = '/ana') {
  return renderWithProviders(
    <Routes>
      <Route path="/:username" element={<Profile />} />
    </Routes>,
    { routerProps: { initialEntries: [path] } },
  );
}

describe('Profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profileApi.getProfile).mockResolvedValue(profileOf() as never);
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { username: 'me' },
    } as never);
    vi.mocked(followsApi.check).mockResolvedValue({
      data: { following: false, status: 'NONE' },
    } as never);
    vi.mocked(postsApi.getByUser).mockResolvedValue(postsPage as never);
    vi.mocked(storiesApi.getByUser).mockResolvedValue({ data: [] } as never);
    vi.mocked(highlightsApi.getProfileHighlights).mockResolvedValue({
      data: [],
    } as never);
  });

  it("shows a public account's posts", async () => {
    renderAt();

    expect(await screen.findByText('grid:post-1')).toBeInTheDocument();
    expect(screen.getByText('other header')).toBeInTheDocument();
    expect(postsApi.getByUser).toHaveBeenCalledWith('ana', 1, 18, 'POST');
  });

  it('keeps a private account closed to non-followers and asks for nothing private', async () => {
    vi.mocked(profileApi.getProfile).mockResolvedValue(
      profileOf({ isPrivate: true }) as never,
    );
    const { i18n } = renderAt();

    expect(
      await screen.findByText(i18n!.t('profile.private.title')),
    ).toBeInTheDocument();
    await waitFor(() => expect(followsApi.check).toHaveBeenCalled());
    expect(postsApi.getByUser).not.toHaveBeenCalled();
    expect(storiesApi.getByUser).not.toHaveBeenCalled();
    expect(highlightsApi.getProfileHighlights).not.toHaveBeenCalled();
  });

  it('opens a private account to its followers', async () => {
    vi.mocked(profileApi.getProfile).mockResolvedValue(
      profileOf({ user: { settings: { privacyLevel: 'PRIVATE' } } }) as never,
    );
    vi.mocked(followsApi.check).mockResolvedValue({
      data: { following: true, status: 'ACCEPTED' },
    } as never);
    renderAt();

    expect(await screen.findByText('grid:post-1')).toBeInTheDocument();
  });

  it('shows only the blocked notice across a block', async () => {
    vi.mocked(followsApi.check).mockResolvedValue({
      data: { following: false, status: 'BLOCKED' },
    } as never);
    const { i18n } = renderAt();

    expect(
      await screen.findByText(i18n!.t('profile.blocked.title')),
    ).toBeInTheDocument();
    expect(screen.queryByText('other header')).not.toBeInTheDocument();
    expect(highlightsApi.getProfileHighlights).not.toHaveBeenCalled();
  });

  it('on its own profile the account sees its own header and never checks following itself', async () => {
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { username: 'ana' },
    } as never);
    renderAt();

    expect(await screen.findByText('own header')).toBeInTheDocument();
    expect(followsApi.check).not.toHaveBeenCalled();
  });

  it('opens a conversation with the account', async () => {
    vi.mocked(chatApi.createGroup).mockResolvedValue({
      data: { id: 'conv-1' },
    } as never);
    renderAt();

    fireEvent.click(await screen.findByRole('button', { name: 'message' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/direct/inbox/t/conv-1'),
    );
    expect(chatApi.createGroup).toHaveBeenCalledWith({
      participantIds: ['prof-ana'],
    });
  });

  it('explains a failed conversation, but not a reached message-request cap (it has its own notice)', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(chatApi.createGroup)
      .mockRejectedValueOnce(
        Object.assign(new Error('x'), { status: 500, data: {} }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('cap'), {
          status: 429,
          data: { errorCode: 'ACTION_LIMIT_REACHED' },
        }),
      );
    const { i18n } = renderAt();
    const button = await screen.findByRole('button', { name: 'message' });

    fireEvent.click(button);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('profile.messages.chat_error'),
      ),
    );
    fireEvent.click(button);
    await waitFor(() => expect(chatApi.createGroup).toHaveBeenCalledTimes(2));
    expect(toast.error).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('confirms a creator subscription after checkout and cleans the address', async () => {
    const { i18n } = renderAt('/ana?success=true&session_id=cs_123');

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('profile.messages.checkout_success'),
      ),
    );
  });

  it('says so when the checkout was cancelled', async () => {
    const { i18n } = renderAt('/ana?canceled=true');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('profile.messages.checkout_canceled'),
      ),
    );
  });

  it('never shows the private notice on a public account while the follow check loads', async () => {
    let answer: (value: unknown) => void = () => {};
    vi.mocked(followsApi.check).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }) as never,
    );
    const { i18n } = renderAt();

    await screen.findByText('other header');
    expect(
      screen.queryByText(i18n!.t('profile.private.title')),
    ).not.toBeInTheDocument();
    expect(postsApi.getByUser).not.toHaveBeenCalled();

    answer({ data: { following: false, status: 'NONE' } });
    expect(await screen.findByText('grid:post-1')).toBeInTheDocument();
  });
});
