import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teamApi } from '../../services/team.service';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import TeamProfileList from './TeamProfileList';

vi.mock('../../services/team.service', () => ({
  teamApi: { profiles: vi.fn() },
}));
const switchProfile = vi.fn();
vi.mock('../../hooks/useProfileSwitch', () => ({
  useProfileSwitch: () => ({
    switchTo: switchProfile,
    isSwitching: false,
    switchingId: undefined,
  }),
}));

const shop = {
  id: 'p-shop',
  username: 'shop',
  fullName: null,
  avatar: null,
  accountType: 'BUSINESS',
  memberRole: 'EDITOR' as const,
};

describe('TeamProfileList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ profile: { id: 'p-mine' } as never });
  });

  it('shows nothing when the person works on no team', async () => {
    vi.mocked(teamApi.profiles).mockResolvedValue([]);
    const { container } = renderWithProviders(<TeamProfileList />);
    await waitFor(() => expect(teamApi.profiles).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each team Profile with the role, and switches to it', async () => {
    vi.mocked(teamApi.profiles).mockResolvedValue([shop]);
    const { i18n } = renderWithProviders(<TeamProfileList />);

    expect(await screen.findByText('@shop')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('settings.team.role.EDITOR')),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.profiles.switch_a11y', { username: 'shop' }),
      }),
    );
    expect(switchProfile).toHaveBeenCalledWith('p-shop');
  });

  it('marks the team Profile in use, which cannot be switched to again', async () => {
    useAuthStore.setState({ profile: { id: 'p-shop' } as never });
    vi.mocked(teamApi.profiles).mockResolvedValue([shop]);
    const { i18n } = renderWithProviders(<TeamProfileList />);

    expect(
      await screen.findByText(i18n!.t('settings.profiles.current')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
