import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import FollowButton from './FollowButton';

vi.mock('../services', () => ({
  followsApi: {
    check: vi.fn(),
    toggle: vi.fn(),
  },
}));

describe('FollowButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(followsApi.check).mockResolvedValue({
      data: { following: false, status: 'NONE' },
    } as never);
  });

  it('labels follow from the catalog, not hardcoded English', async () => {
    const { i18n } = renderWithProviders(
      <FollowButton username="SophiaStyle" />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: i18n!.t('profile.actions.follow') }),
      ).toBeInTheDocument();
    });
    expect(i18n!.t('profile.actions.follow')).toBe('Follow');
    expect(screen.queryByText('Seguir')).not.toBeInTheDocument();
  });

  it('uses Spanish follow label when locale is es', async () => {
    const { i18n } = renderWithProviders(
      <FollowButton username="SophiaStyle" />,
      { lng: 'es' },
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: i18n!.t('profile.actions.follow') }),
      ).toBeInTheDocument();
    });
    expect(i18n!.t('profile.actions.follow')).toBe('Seguir');
    expect(screen.queryByText('Follow')).not.toBeInTheDocument();
  });

  it('labels following state from the catalog', async () => {
    vi.mocked(followsApi.check).mockResolvedValue({
      data: { following: true, status: 'ACCEPTED' },
    } as never);

    const { i18n } = renderWithProviders(
      <FollowButton username="SophiaStyle" />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: i18n!.t('profile.actions.following'),
        }),
      ).toBeInTheDocument();
    });
  });
});
