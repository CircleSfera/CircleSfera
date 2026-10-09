import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/api';
import { renderWithProviders } from '../test/test-utils';
import HelpArticle from './HelpArticle';

vi.mock('../services/api', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('../components/common/SEO', () => ({ default: () => null }));

const open = (lng: 'en' | 'es' = 'en') =>
  renderWithProviders(
    <Routes>
      <Route path="/help/:slug" element={<HelpArticle />} />
    </Routes>,
    {
      lng,
      routerProps: {
        initialEntries: ['/help/mobile-app'],
        useTransitions: false,
      },
    },
  );

describe('HelpArticle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the article in the language of the reader, with markup typed in it as text', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        slug: 'mobile-app',
        topic: 'OTHER',
        locale: 'es',
        title: '¿Hay app móvil?',
        body: 'Funciona en el navegador.\n\n<img src=x onerror=alert(1)>',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const { container, i18n } = open('es');

    expect(
      await screen.findByRole('heading', { level: 1, name: '¿Hay app móvil?' }),
    ).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/help/articles/mobile-app', {
      params: { locale: 'es' },
    });
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(container.querySelector('article p img')).toBeNull();
    // The way back, above the article (the footer links there too).
    expect(
      screen.getAllByRole('link', { name: i18n!.t('helpCentre.back') })[0],
    ).toHaveAttribute('href', '/help');
  });

  it('says the article does not exist when the address is not a published one', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(
      Object.assign(new Error('Article not found'), { status: 404 }),
    );
    const { i18n } = open();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      i18n!.t('helpCentre.missing_title'),
    );
    expect(screen.getByText(i18n!.t('helpCentre.missing_desc'))).toBeVisible();
  });

  it('says it could not be loaded when the failure is something else', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(
      Object.assign(new Error('down'), { status: 500 }),
    );
    const { i18n } = open();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      i18n!.t('helpCentre.load_error'),
    );
    expect(
      screen.queryByText(i18n!.t('helpCentre.missing_desc')),
    ).not.toBeInTheDocument();
  });
});
