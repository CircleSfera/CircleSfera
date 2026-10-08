import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { renderWithProviders } from '../test/test-utils';
import { Support } from './Support';

vi.mock('../services/api', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn().mockResolvedValue({ data: { data: [], meta: {} } }),
  },
}));
vi.mock('../components/common/SEO', () => ({ default: () => null }));

const clientError = (status: number | undefined, extra: object = {}) =>
  Object.assign(new Error('server text, never shown'), {
    status,
    data: {},
    ...extra,
  });

describe('Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: true,
      profile: {
        id: 'p1',
        userId: 'u1',
        user: { email: 'ana@example.com' },
      } as never,
    });
  });

  const submit = (t: (k: string) => string) => {
    fireEvent.change(
      screen.getByPlaceholderText(t('supportPage.subject_placeholder')),
      {
        target: { value: 'Payment' },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText(t('supportPage.message_placeholder')),
      {
        target: { value: 'My tip did not arrive' },
      },
    );
    fireEvent.submit(
      screen
        .getByPlaceholderText(t('supportPage.subject_placeholder'))
        .closest('form')!,
    );
  };

  it('says why a ticket could not be sent instead of always the generic text', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      clientError(undefined, { isNetworkError: true }),
    );
    const { i18n } = renderWithProviders(<Support />);

    submit(i18n!.t.bind(i18n));

    expect(
      await screen.findByText(i18n!.t('errors.generic.network')),
    ).toBeInTheDocument();
    expect(screen.queryByText(/server text/)).not.toBeInTheDocument();
  });

  it('falls back to its own message for an unexplained failure', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(clientError(400));
    const { i18n } = renderWithProviders(<Support />);

    submit(i18n!.t.bind(i18n));

    expect(
      await screen.findByText(i18n!.t('supportPage.error_generic')),
    ).toBeInTheDocument();
  });

  it('sends the topic the participant chose with the ticket', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    const { i18n } = renderWithProviders(<Support />);
    const t = i18n!.t.bind(i18n);

    fireEvent.change(screen.getByLabelText(t('supportPage.category_label')), {
      target: { value: 'PAYMENTS' },
    });
    submit(t);

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/support/tickets',
        expect.objectContaining({ category: 'PAYMENTS' }),
      ),
    );
  });
});
