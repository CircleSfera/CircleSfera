import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { i18n as I18n } from 'i18next';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { liveApi } from '../../services/live';
import { profileApi } from '../../services/profile.service';
import { renderWithProviders } from '../../test/test-utils';
import LiveBroadcaster from './LiveBroadcaster';

vi.mock('@livekit/components-styles', () => ({}));

vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="livekit-room">{children}</div>
  ),
  RoomAudioRenderer: () => null,
}));

vi.mock('../../components/live/CinematicStage', () => ({
  default: () => <div data-testid="cinematic-stage" />,
}));

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock('../../services/api', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('../../stores/socketStore', () => ({
  useSocketStore: {
    getState: () => ({ socket: null }),
  },
}));

vi.mock('../../services/live', () => ({
  liveApi: {
    inviteCoHost: vi.fn(),
    removeCoHost: vi.fn(),
  },
}));

vi.mock('../../services/profile.service', () => ({
  profileApi: {
    getProfile: vi.fn(),
  },
}));

async function startStream() {
  vi.mocked(apiClient.post).mockImplementation((url: string) => {
    if (url === '/live/start') {
      return Promise.resolve({
        data: { token: 'lk-token', stream: { id: 'stream-1' } },
      });
    }
    return Promise.resolve({ data: {} });
  });

  const view = renderWithProviders(<LiveBroadcaster />);
  fireEvent.click(
    screen.getByRole('button', {
      name: view.i18n!.t('live.start_button'),
    }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole('button', {
        name: view.i18n!.t('live.end_stream'),
      }),
    ).toBeInTheDocument();
  });
  return view;
}

/** Presses the end button and confirms in the dialog that opens. */
async function endStream(i18n: I18n) {
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('live.end_stream') }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: i18n.t('live.end_stream') }),
  );
}

describe('LiveBroadcaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses catalog copy on the setup screen', () => {
    const { i18n } = renderWithProviders(<LiveBroadcaster />);

    expect(i18n!.t('live.setup_title')).toBe('Go live');
    expect(
      screen.getByRole('heading', { name: i18n!.t('live.setup_title') }),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.title_label'))).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(i18n!.t('live.title_placeholder')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.start_button') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('common.close') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Empezar directo' }),
    ).not.toBeInTheDocument();
  });

  it('uses Spanish setup copy', () => {
    const { i18n } = renderWithProviders(<LiveBroadcaster />, { lng: 'es' });

    expect(i18n!.t('live.setup_title')).toBe('Empezar directo');
    expect(
      screen.getByRole('heading', { name: i18n!.t('live.setup_title') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.start_button') }),
    ).toBeInTheDocument();
  });

  it('labels end stream from the catalog after start', async () => {
    const { i18n } = await startStream();

    expect(i18n!.t('live.end_stream')).toBe('End livestream');
    expect(
      screen.getByRole('button', { name: i18n!.t('live.end_stream') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Terminar transmisión' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.goal.add'))).toBeInTheDocument();
  });

  it('shows the ended summary from the catalog', async () => {
    const { i18n } = await startStream();

    await endStream(i18n!);

    expect(
      await screen.findByRole('heading', { name: i18n!.t('live.ended_title') }),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.ended_summary'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.viewers'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.likes'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.close_summary') }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Live Finalizado')).not.toBeInTheDocument();
  });

  describe('ending the live', () => {
    it('asks before ending, and keeps broadcasting when the answer is no', async () => {
      const { i18n } = await startStream();

      fireEvent.click(
        screen.getByRole('button', { name: i18n!.t('live.end_stream') }),
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText(i18n!.t('live.end_confirm_title')),
      ).toBeInTheDocument();
      expect(apiClient.post).not.toHaveBeenCalledWith('/live/end');

      fireEvent.click(
        within(dialog).getByRole('button', {
          name: i18n!.t('live.end_confirm_keep'),
        }),
      );

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(apiClient.post).not.toHaveBeenCalledWith('/live/end');
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    it('stays on air and says so when the server could not end the live', async () => {
      const { i18n } = await startStream();
      vi.mocked(apiClient.post).mockImplementation((url: string) =>
        url === '/live/end'
          ? Promise.reject(new Error('down'))
          : Promise.resolve({ data: {} }),
      );

      await endStream(i18n!);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(i18n!.t('live.end_failed')),
      );
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: i18n!.t('live.ended_title') }),
      ).not.toBeInTheDocument();
    });
  });

  it('says so when the live could not start, and lets the person try again', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(<LiveBroadcaster />);
    const start = screen.getByRole('button', {
      name: i18n!.t('live.start_button'),
    });

    fireEvent.click(start);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(i18n!.t('live.start_failed')),
    );
    expect(
      screen.getByRole('button', { name: i18n!.t('live.start_button') }),
    ).toBeEnabled();
  });

  describe('inviting a co-host', () => {
    async function openInvite(username: string) {
      const view = await startStream();
      fireEvent.click(
        screen.getByRole('button', {
          name: view.i18n!.t('live.cohost_invite_button'),
        }),
      );
      fireEvent.change(
        screen.getByRole('textbox', {
          name: view.i18n!.t('live.cohost_input_placeholder'),
        }),
        { target: { value: username } },
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: view.i18n!.t('live.cohost_invite_send'),
        }),
      );
      return view;
    }

    it('invites the account and shows it as co-host, with a named way to remove it', async () => {
      vi.mocked(profileApi.getProfile).mockResolvedValue({
        data: { user: { id: 'user-2' } },
      } as never);
      vi.mocked(liveApi.inviteCoHost).mockResolvedValue({} as never);

      const { i18n } = await openInvite('@ana');

      await waitFor(() =>
        expect(liveApi.inviteCoHost).toHaveBeenCalledWith('stream-1', 'user-2'),
      );
      expect(profileApi.getProfile).toHaveBeenCalledWith('ana');
      expect(await screen.findByText('@ana')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: i18n!.t('live.cohost_remove') }),
      ).toBeInTheDocument();
    });

    it('says the account was not found, and invites nobody', async () => {
      vi.mocked(profileApi.getProfile).mockRejectedValue(new Error('404'));

      const { i18n } = await openInvite('nadie');

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n!.t('live.cohost_not_found', { username: 'nadie' }),
        ),
      );
      expect(liveApi.inviteCoHost).not.toHaveBeenCalled();
    });

    it('says the invitation failed', async () => {
      vi.mocked(profileApi.getProfile).mockResolvedValue({
        data: { user: { id: 'user-2' } },
      } as never);
      vi.mocked(liveApi.inviteCoHost).mockRejectedValue(new Error('down'));

      const { i18n } = await openInvite('ana');

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n!.t('live.cohost_invite_failed'),
        ),
      );
    });
  });

  it('sets the goal from a dialog of the app, only with a title and a whole number', async () => {
    const { i18n } = await startStream();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('live.goal.add') }),
    );
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', {
      name: i18n!.t('live.goal.save'),
    });
    expect(save).toBeDisabled();

    fireEvent.change(
      within(dialog).getByLabelText(i18n!.t('live.goal.title_label')),
      { target: { value: 'New camera' } },
    );
    fireEvent.change(
      within(dialog).getByLabelText(i18n!.t('live.goal.target_label')),
      { target: { value: '0' } },
    );
    expect(save).toBeDisabled();

    fireEvent.change(
      within(dialog).getByLabelText(i18n!.t('live.goal.target_label')),
      { target: { value: '500' } },
    );
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('names every control of the live screen', async () => {
    const { i18n } = await startStream();

    for (const name of [
      i18n!.t('live.end_stream'),
      i18n!.t('live.cohost_invite_button'),
      i18n!.t('live.qna.title'),
      i18n!.t('live.send_comment'),
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('textbox', { name: i18n!.t('live.chat_placeholder') }),
    ).toBeInTheDocument();
  });
});
