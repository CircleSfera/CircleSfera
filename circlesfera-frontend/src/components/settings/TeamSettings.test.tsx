import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teamApi } from '../../services/team.service';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import TeamSettings from './TeamSettings';

vi.mock('../../services/team.service', () => ({
  teamApi: {
    activity: vi.fn(),
    get: vi.fn(),
    invite: vi.fn(),
    remove: vi.fn(),
    invitations: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const asProfile = (accountType: 'PERSONAL' | 'BUSINESS') =>
  useAuthStore.setState({
    profile: { id: 'p-shop', username: 'shop', accountType } as never,
  });

const team = (over: object = {}) => ({
  available: true,
  seats: { used: 1, max: 5 },
  members: [
    {
      id: 'm-1',
      role: 'EDITOR',
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00.000Z',
      acceptedAt: '2026-10-02T00:00:00.000Z',
      person: { id: 'p-ana', username: 'ana', fullName: null, avatar: null },
    },
  ],
  ...over,
});

describe('TeamSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(teamApi.invitations).mockResolvedValue([]);
    vi.mocked(teamApi.get).mockResolvedValue(team() as never);
    vi.mocked(teamApi.activity).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });
  });

  it('a Business owner sees the team, the seats, and invites a person with a role', async () => {
    asProfile('BUSINESS');
    vi.mocked(teamApi.invite).mockResolvedValue({ id: 'm-2' });
    const { i18n } = renderWithProviders(<TeamSettings />);
    const t = (k: string, o: Record<string, unknown> = {}) =>
      i18n!.t(`settings.team.${k}`, o);

    expect(await screen.findByText('@ana')).toBeInTheDocument();
    expect(
      screen.getByText(t('seats', { used: 1, max: 5 })),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(t('username')), {
      target: { value: ' @maria ' },
    });
    fireEvent.change(screen.getByLabelText(t('role_label')), {
      target: { value: 'ADMINISTRATOR' },
    });
    expect(screen.getByText(t('role_desc.ADMINISTRATOR'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('invite') }));

    await waitFor(() =>
      expect(teamApi.invite).toHaveBeenCalledWith('@maria', 'ADMINISTRATOR'),
    );
    expect(toast.success).toHaveBeenCalledWith(t('invited'));
  });

  it('removes a member and withdraws an invitation', async () => {
    asProfile('BUSINESS');
    vi.mocked(teamApi.get).mockResolvedValue(
      team({
        members: [
          {
            id: 'm-1',
            role: 'EDITOR',
            status: 'INVITED',
            createdAt: '2026-10-01T00:00:00.000Z',
            acceptedAt: null,
            person: {
              id: 'p-ana',
              username: 'ana',
              fullName: null,
              avatar: null,
            },
          },
        ],
      }) as never,
    );
    vi.mocked(teamApi.remove).mockResolvedValue({ success: true });
    const { i18n } = renderWithProviders(<TeamSettings />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.team.withdraw'),
      }),
    );
    await waitFor(() => expect(teamApi.remove).toHaveBeenCalledWith('m-1'));
  });

  it('a full team cannot invite more', async () => {
    asProfile('BUSINESS');
    vi.mocked(teamApi.get).mockResolvedValue(
      team({ seats: { used: 5, max: 5 } }) as never,
    );
    const { i18n } = renderWithProviders(<TeamSettings />);
    expect(
      await screen.findByRole('button', {
        name: i18n!.t('settings.team.full'),
      }),
    ).toBeDisabled();
  });

  it('says why an invitation failed', async () => {
    asProfile('BUSINESS');
    vi.mocked(teamApi.invite).mockRejectedValue({
      status: 409,
      data: { errorCode: 'TEAM_ALREADY_MEMBER' },
    });
    const { i18n } = renderWithProviders(<TeamSettings />);

    fireEvent.change(
      await screen.findByLabelText(i18n!.t('settings.team.username')),
      { target: { value: 'ana' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('settings.team.invite') }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('errors.codes.TEAM_ALREADY_MEMBER'),
      ),
    );
  });

  it('without the Business plan, offers the plans', async () => {
    asProfile('BUSINESS');
    vi.mocked(teamApi.get).mockResolvedValue(
      team({ available: false, members: [] }) as never,
    );
    const { i18n } = renderWithProviders(<TeamSettings />);
    expect(
      await screen.findByText(i18n!.t('settings.team.plan_required')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('settings.team.see_plans') }),
    ).toHaveAttribute('href', '/pricing');
  });

  it('a profile that is not Business sees no team, and asks for none', async () => {
    asProfile('PERSONAL');
    const { i18n } = renderWithProviders(<TeamSettings />);
    expect(
      await screen.findByText(i18n!.t('settings.team.business_only')),
    ).toBeInTheDocument();
    expect(teamApi.get).not.toHaveBeenCalled();
  });

  it('someone who is not the owner is told so', async () => {
    asProfile('BUSINESS');
    vi.mocked(teamApi.get).mockRejectedValue({ status: 403, data: {} });
    const { i18n } = renderWithProviders(<TeamSettings />);
    expect(
      await screen.findByText(i18n!.t('settings.team.owner_only')),
    ).toBeInTheDocument();
  });

  it('accepts or declines an invitation, and says when two-step verification is missing', async () => {
    asProfile('PERSONAL');
    vi.mocked(teamApi.invitations).mockResolvedValue([
      {
        id: 'inv-1',
        role: 'EDITOR',
        createdAt: '2026-10-01T00:00:00.000Z',
        profile: {
          id: 'p-shop',
          username: 'shop',
          fullName: null,
          avatar: null,
        },
      },
    ]);
    vi.mocked(teamApi.accept).mockRejectedValueOnce({
      status: 403,
      data: { errorCode: 'TEAM_TWO_FACTOR_REQUIRED' },
    });
    vi.mocked(teamApi.decline).mockResolvedValue({ success: true });
    const { i18n } = renderWithProviders(<TeamSettings />);
    const t = (k: string) => i18n!.t(`settings.team.${k}`);

    expect(await screen.findByText('@shop')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('accept') }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('errors.codes.TEAM_TWO_FACTOR_REQUIRED'),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: t('decline') }));
    await waitFor(() => expect(teamApi.decline).toHaveBeenCalledWith('inv-1'));
  });
});
