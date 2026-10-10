import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../../services/auth.service';
import { renderWithProviders } from '../../test/test-utils';
import { ActiveSessionsSettings } from './ActiveSessionsSettings';

vi.mock('../../services/auth.service', () => ({
  authApi: {
    getSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  },
}));

describe('ActiveSessionsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says there are no other sessions when the list is empty', async () => {
    vi.mocked(authApi.getSessions).mockResolvedValue({ data: [] } as never);
    const { i18n } = renderWithProviders(<ActiveSessionsSettings />);

    expect(
      await screen.findByText(i18n!.t('settings.security.no_other_sessions')),
    ).toBeInTheDocument();
  });

  it.each([
    ['is not a list', () => Promise.resolve({ data: { message: 'ok' } })],
    ['cannot be read', () => Promise.reject(new Error('down'))],
  ])('does not say "no sessions" when the list %s', async (_case, answer) => {
    vi.mocked(authApi.getSessions).mockImplementation(answer as never);
    const { i18n, container } = renderWithProviders(<ActiveSessionsSettings />);

    // The error shown is the component's own line for a failed load.
    await screen.findAllByText(i18n!.t('settings.security.sessions_subtitle'));
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(
      screen.queryByText(i18n!.t('settings.security.no_other_sessions')),
    ).not.toBeInTheDocument();
  });
});
