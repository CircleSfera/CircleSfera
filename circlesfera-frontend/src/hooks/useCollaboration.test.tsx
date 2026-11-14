import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collaborationsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { createTestI18n, createTestQueryClient } from '../test/test-utils';
import type { Post } from '../types';
import { canHaveCollaborator, useCollaboration } from './useCollaboration';

vi.mock('../services', () => ({
  collaborationsApi: { leave: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  const i18n = createTestI18n('en');
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
};

const post = (over: Partial<Post> = {}) =>
  ({ id: 'post-1', profileId: 'ana', collaborator: null, ...over }) as Post;

describe('canHaveCollaborator', () => {
  it('lets only a public post that is shown have one', () => {
    expect(canHaveCollaborator(post())).toBe(true);
    expect(canHaveCollaborator(post({ visibility: 'PUBLIC' }))).toBe(true);
    expect(canHaveCollaborator(post({ visibility: 'FOLLOWERS' }))).toBe(false);
    expect(canHaveCollaborator(post({ archivedAt: '2026-11-09' }))).toBe(false);
  });
});

describe('useCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collaborationsApi.leave).mockResolvedValue({} as never);
  });

  it('lets the collaborator leave, and nobody else', async () => {
    useAuthStore.setState({ profile: { id: 'bea' } } as never);
    const shared = post({
      collaborator: { id: 'bea' } as Post['collaborator'],
    });
    const { result } = renderHook(() => useCollaboration(shared), {
      wrapper: createWrapper(),
    });
    expect(result.current.isCollaborator).toBe(true);

    act(() => result.current.leave());
    await waitFor(() =>
      expect(collaborationsApi.leave).toHaveBeenCalledWith('post-1'),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "You're no longer a collaborator on this post",
      ),
    );

    useAuthStore.setState({ profile: { id: 'cid' } } as never);
    const other = renderHook(() => useCollaboration(shared), {
      wrapper: createWrapper(),
    });
    expect(other.result.current.isCollaborator).toBe(false);
  });
});
