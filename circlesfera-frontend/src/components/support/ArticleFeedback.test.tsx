import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import { ArticleFeedback } from './ArticleFeedback';

vi.mock('../../services/api', () => ({ apiClient: { post: vi.fn() } }));

describe('ArticleFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });
  });

  it('sends a yes, thanks the reader and does not ask again on coming back', async () => {
    const { i18n, unmount } = renderWithProviders(
      <ArticleFeedback slug="refunds" />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('helpCentre.feedback.yes') }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      i18n!.t('helpCentre.feedback.thanks'),
    );
    // Only the answer is sent: nothing about who gives it.
    expect(apiClient.post).toHaveBeenCalledWith(
      '/help/articles/refunds/feedback',
      { useful: true },
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    unmount();
    renderWithProviders(<ArticleFeedback slug="refunds" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('after a no, shows the way to write to support', async () => {
    const { i18n } = renderWithProviders(<ArticleFeedback slug="refunds" />);
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('helpCentre.feedback.no') }),
    );

    expect(
      await screen.findByRole('link', {
        name: i18n!.t('helpCentre.contact_cta'),
      }),
    ).toHaveAttribute('href', '/support');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/help/articles/refunds/feedback',
      { useful: false },
    );
  });

  it('remembers each article on its own', () => {
    localStorage.setItem('help-article-answered:refunds', 'yes');
    renderWithProviders(<ArticleFeedback slug="plans" />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('says so and lets the reader try again when the answer cannot be sent', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('down'));
    const { i18n } = renderWithProviders(<ArticleFeedback slug="refunds" />);
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('helpCentre.feedback.yes') }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      i18n!.t('helpCentre.feedback.error'),
    );
    expect(localStorage.getItem('help-article-answered:refunds')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('helpCentre.feedback.yes') }),
    );
    await screen.findByRole('status');
  });

  it('still works in a browser that refuses to remember', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refused');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });
    const { i18n } = renderWithProviders(<ArticleFeedback slug="refunds" />);
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('helpCentre.feedback.yes') }),
    );

    await screen.findByRole('status');
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
  });
});
