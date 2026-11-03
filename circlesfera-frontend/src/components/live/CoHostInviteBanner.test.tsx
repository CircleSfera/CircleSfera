import { act, fireEvent, screen } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveApi } from '../../services/live';
import { renderWithProviders } from '../../test/test-utils';
import CoHostInviteBanner from './CoHostInviteBanner';

vi.mock('../../services/live', () => ({
  liveApi: { acceptGuestInvite: vi.fn(), declineGuestInvite: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

const invite = {
  streamId: 'stream-1',
  streamTitle: 'Night set',
  host: { username: 'alice', avatar: null },
};

describe('CoHostInviteBanner', () => {
  beforeEach(() => vi.clearAllMocks());

  function open() {
    const props = { onAccepted: vi.fn(), onDismiss: vi.fn() };
    const view = renderWithProviders(
      <CoHostInviteBanner invite={invite} {...props} />,
    );
    return { ...props, t: view.i18n!.t };
  }

  it('goes on air with the token the server gives', async () => {
    vi.mocked(liveApi.acceptGuestInvite).mockResolvedValue({
      token: 'guest-token',
      streamId: 'stream-1',
    });
    const { onAccepted, t } = open();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: t('live.cohost_invite.join') }),
      );
    });

    expect(liveApi.acceptGuestInvite).toHaveBeenCalledWith('stream-1');
    expect(onAccepted).toHaveBeenCalledWith('guest-token', 'stream-1');
  });

  it('says why it could not go on air, and lets the invite go', async () => {
    vi.mocked(liveApi.acceptGuestInvite).mockRejectedValue(new Error('full'));
    const { onAccepted, onDismiss, t } = open();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: t('live.cohost_invite.join') }),
      );
    });

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(t('live.guests.accept_failed'));
  });

  it('tells the host when the invite is declined', () => {
    vi.mocked(liveApi.declineGuestInvite).mockResolvedValue({});
    const { onDismiss, t } = open();

    fireEvent.click(
      screen.getByRole('button', { name: t('live.cohost_invite.decline') }),
    );

    expect(liveApi.declineGuestInvite).toHaveBeenCalledWith('stream-1');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders nothing without an invite', () => {
    const { container } = renderWithProviders(
      <CoHostInviteBanner
        invite={null}
        onAccepted={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('labels the invite from the catalog', () => {
    const onDismiss = vi.fn();
    const { i18n } = renderWithProviders(
      <CoHostInviteBanner
        invite={invite}
        onAccepted={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    expect(i18n!.t('live.cohost_invite.badge')).toBe('Live invitation');
    expect(
      screen.getByText(i18n!.t('live.cohost_invite.badge')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('live.cohost_invite.body')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('live.cohost_invite.join'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('live.cohost_invite.decline'),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Night set/)).toBeInTheDocument();
    expect(screen.queryByText('Invitación en directo')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/te invita como co-anfitrión/i),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('live.cohost_invite.decline'),
      }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses Spanish invite copy', () => {
    const { i18n } = renderWithProviders(
      <CoHostInviteBanner
        invite={invite}
        onAccepted={vi.fn()}
        onDismiss={vi.fn()}
      />,
      { lng: 'es' },
    );

    expect(i18n!.t('live.cohost_invite.badge')).toBe('Invitación en directo');
    expect(
      screen.getByText(i18n!.t('live.cohost_invite.badge')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('live.cohost_invite.join'),
      }),
    ).toBeInTheDocument();
  });
});
