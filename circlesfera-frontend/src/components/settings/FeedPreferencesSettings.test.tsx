import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services';
import { usersApi } from '../../services/users.service';
import { renderWithProviders } from '../../test/test-utils';
import FeedPreferencesSettings from './FeedPreferencesSettings';

vi.mock('../../services', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../services/users.service', () => ({
  usersApi: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FeedPreferencesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.getSettings).mockResolvedValue({
      data: {
        contentPreference: 'GENERAL',
        blurSensitiveContent: true,
      },
    } as never);
    vi.mocked(usersApi.updateSettings).mockResolvedValue({} as never);
    vi.mocked(api.get).mockResolvedValue({
      data: { mutedKeywords: [], hiddenAuthors: [], hiddenPosts: [] },
    });
  });

  it('shows a sensitive-content toggle and no adult or 18+ language', async () => {
    const { i18n } = renderWithProviders(<FeedPreferencesSettings />);

    expect(
      await screen.findByLabelText(i18n!.t('feedPrefs.show_sensitive')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('feedPrefs.show_sensitive_desc')),
    ).toBeInTheDocument();
    expect(screen.queryByText(/18\+/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mature/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('persists GENERAL vs MATURE from the sensitive-content switch', async () => {
    const { i18n } = renderWithProviders(<FeedPreferencesSettings />);

    const toggle = await screen.findByLabelText(
      i18n!.t('feedPrefs.show_sensitive'),
    );
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(usersApi.updateSettings).toHaveBeenCalledWith({
        contentPreference: 'MATURE',
      });
    });
  });
});
