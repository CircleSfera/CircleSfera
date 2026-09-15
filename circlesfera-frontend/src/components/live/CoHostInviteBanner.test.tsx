import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import CoHostInviteBanner from './CoHostInviteBanner';

const invite = {
  streamId: 'stream-1',
  streamTitle: 'Night set',
  host: { username: 'alice', avatar: null },
};

describe('CoHostInviteBanner', () => {
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
