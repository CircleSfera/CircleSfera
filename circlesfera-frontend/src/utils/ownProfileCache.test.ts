import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { keepSavedOwnProfile } from './ownProfileCache';

const client = () => new QueryClient();

describe('keepSavedOwnProfile', () => {
  it('keeps what the save does not answer, such as the verified email', () => {
    const queryClient = client();
    queryClient.setQueryData(['myProfile'], {
      data: {
        username: 'ana',
        accentColor: null,
        emailConfirmed: true,
        user: { id: 'u-1', emailVerified: '2026-01-01T00:00:00.000Z' },
      },
    });

    const held = keepSavedOwnProfile(queryClient, {
      data: { username: 'ana', accentColor: 'teal', user: { id: 'u-1' } },
    });

    expect(held).toEqual({
      username: 'ana',
      accentColor: 'teal',
      emailConfirmed: true,
      user: { id: 'u-1', emailVerified: '2026-01-01T00:00:00.000Z' },
    });
    expect(queryClient.getQueryData(['myProfile'])).toEqual({ data: held });
  });

  it('asks for the own Profile again', () => {
    const queryClient = client();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    keepSavedOwnProfile<Record<string, unknown>>(queryClient, {
      data: { username: 'ana' },
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['myProfile'] });
  });

  it('holds the answer as it came when nothing was known yet', () => {
    const queryClient = client();

    expect(
      keepSavedOwnProfile<Record<string, unknown>>(queryClient, {
        data: { username: 'ana' },
      }),
    ).toEqual({ username: 'ana' });
  });
});
