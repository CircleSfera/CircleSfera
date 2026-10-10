import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/api';
import { renderWithProviders } from '../test/test-utils';
import HelpCentre from './HelpCentre';

vi.mock('../services/api', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('../components/common/SEO', () => ({ default: () => null }));

const articles = [
  { slug: 'is-circlesfera-free', topic: 'PAYMENTS', title: 'Is it free?' },
  { slug: 'mobile-app', topic: 'OTHER', title: 'Is there an app?' },
];

describe('HelpCentre', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the published articles under their topic, each leading to its page', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { locale: 'en', articles },
    });
    const { i18n } = renderWithProviders(<HelpCentre />);

    const link = await screen.findByRole('link', { name: 'Is it free?' });
    expect(link).toHaveAttribute('href', '/help/is-circlesfera-free');
    expect(
      screen.getByRole('heading', {
        name: i18n!.t('supportPage.category.PAYMENTS'),
      }),
    ).toBeInTheDocument();
    // A topic without articles has no heading.
    expect(
      screen.queryByRole('heading', {
        name: i18n!.t('supportPage.category.ACCOUNT'),
      }),
    ).not.toBeInTheDocument();
    // "Something else" is called general over a list of articles.
    expect(
      screen.getByRole('heading', {
        name: i18n!.t('helpCentre.topic_general'),
      }),
    ).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/help/articles', {
      params: { locale: 'en' },
    });
  });

  it('asks for the words typed, after a pause, and shows the results in one list', async () => {
    vi.mocked(apiClient.get).mockImplementation((_url, config) =>
      Promise.resolve({
        data: {
          locale: 'en',
          articles: (config as { params: { q?: string } }).params.q
            ? [articles[1]]
            : articles,
        },
      } as never),
    );
    const { i18n } = renderWithProviders(<HelpCentre />);
    await screen.findByRole('link', { name: 'Is it free?' });

    fireEvent.change(
      screen.getByRole('searchbox', {
        name: i18n!.t('helpCentre.search_label'),
      }),
      { target: { value: ' app ' } },
    );

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/help/articles', {
        params: { locale: 'en', q: 'app' },
      }),
    );
    await screen.findByText(i18n!.t('helpCentre.results', { count: 1 }));
    expect(
      screen.queryByRole('link', { name: 'Is it free?' }),
    ).not.toBeInTheDocument();
  });

  it('does not search a single character', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { locale: 'en', articles },
    });
    const { i18n } = renderWithProviders(<HelpCentre />);
    await screen.findByRole('link', { name: 'Is it free?' });

    fireEvent.change(
      screen.getByRole('searchbox', {
        name: i18n!.t('helpCentre.search_label'),
      }),
      { target: { value: 'a' } },
    );
    await new Promise((done) => setTimeout(done, 400));

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Is it free?' })).toBeVisible();
  });

  it('says so when nothing matches, and when the list cannot be loaded', async () => {
    vi.mocked(apiClient.get).mockImplementation((_url, config) =>
      (config as { params: { q?: string } }).params.q
        ? Promise.resolve({ data: { locale: 'en', articles: [] } } as never)
        : Promise.reject(new Error('down')),
    );
    const { i18n } = renderWithProviders(<HelpCentre />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      i18n!.t('helpCentre.load_error'),
    );

    fireEvent.change(
      screen.getByRole('searchbox', {
        name: i18n!.t('helpCentre.search_label'),
      }),
      { target: { value: 'zebra' } },
    );
    await screen.findByText(
      i18n!.t('helpCentre.no_results', { words: 'zebra' }),
    );
  });

  it('says there are no articles yet when none is published', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { locale: 'en', articles: [] },
    });
    const { i18n } = renderWithProviders(<HelpCentre />);
    await screen.findByText(i18n!.t('helpCentre.empty'));
    expect(
      screen.getByRole('link', { name: i18n!.t('helpCentre.contact_cta') }),
    ).toHaveAttribute('href', '/support');
  });
});
