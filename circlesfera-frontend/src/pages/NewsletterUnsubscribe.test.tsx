import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import NewsletterUnsubscribe from './NewsletterUnsubscribe';

vi.mock('../services', () => ({
  authApi: { unsubscribeNewsletter: vi.fn() },
}));

const open = (url: string) =>
  renderWithProviders(<NewsletterUnsubscribe />, {
    routerProps: { initialEntries: [url] },
  });

describe('NewsletterUnsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('waits for the button, then unsubscribes with the token of the link', async () => {
    vi.mocked(authApi.unsubscribeNewsletter).mockResolvedValue({} as never);
    const { i18n } = open('/newsletter/unsubscribe?token=abc.def');

    // Opening the link, as a mail scanner does, unsubscribes nobody.
    expect(authApi.unsubscribeNewsletter).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('newsletter.unsubscribe.button'),
      }),
    );

    expect(
      await screen.findByText(i18n!.t('newsletter.unsubscribe.done_title')),
    ).toBeInTheDocument();
    expect(authApi.unsubscribeNewsletter).toHaveBeenCalledWith('abc.def');
  });

  it('says the link is not valid when the server refuses it', async () => {
    vi.mocked(authApi.unsubscribeNewsletter).mockRejectedValue(
      new Error('400'),
    );
    const { i18n } = open('/newsletter/unsubscribe?token=forged');

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('newsletter.unsubscribe.button'),
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        i18n!.t('newsletter.unsubscribe.error'),
      ),
    );
  });

  it('a link without a token offers no button', () => {
    const { i18n } = open('/newsletter/unsubscribe');

    expect(
      screen.queryByRole('button', {
        name: i18n!.t('newsletter.unsubscribe.button'),
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
