import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';

const fetchMock = vi.fn();

const suggestion = {
  mapbox_id: 'place-1',
  name: 'España',
  place_formatted: 'Europa',
};
const featureIn = (language: string | null, mapboxId = 'place-1') => ({
  properties:
    language === 'es'
      ? {
          mapbox_id: mapboxId,
          name: 'España',
          place_formatted: 'Europa',
          coordinates: { latitude: 40.4, longitude: -3.7 },
          context: { country: { name: 'España' } },
        }
      : {
          mapbox_id: mapboxId,
          name: 'Spain',
          place_formatted: 'Europe',
          coordinates: { latitude: 40.4, longitude: -3.7 },
          context: { country: { name: 'Spain' } },
        },
});

/** Answers the map provider; `english` changes what the English request gets. */
function answerPlaces(english: 'ok' | 'down' | 'other place' = 'ok') {
  fetchMock.mockImplementation(async (address: string) => {
    const url = new URL(address);
    if (url.pathname.includes('/suggest')) {
      return { ok: true, json: async () => ({ suggestions: [suggestion] }) };
    }
    const language = url.searchParams.get('language');
    if (language === 'en' && english === 'down') {
      return { ok: false, status: 500 };
    }
    const id =
      language === 'en' && english === 'other place' ? 'place-2' : 'place-1';
    return {
      ok: true,
      json: async () => ({ features: [featureIn(language, id)] }),
    };
  });
}

const requested = (part: string) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(url as string))
    .filter((url) => url.pathname.includes(part));

async function renderLocation(options: {
  profileLanguage?: 'en' | 'es';
  appLanguage: 'en' | 'es';
}) {
  const { useAuthStore } = await import('../../stores/authStore');
  useAuthStore.setState({
    profile: options.profileLanguage
      ? ({ user: { locale: options.profileLanguage } } as never)
      : null,
  });
  const { default: LocationSubScreen } = await import('./LocationSubScreen');
  const onSelect = vi.fn();
  renderWithProviders(
    <LocationSubScreen onClose={vi.fn()} onSelect={onSelect} />,
    { lng: options.appLanguage },
  );
  return { onSelect };
}

describe('language of places', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    answerPlaces();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('searches and saves the place in the language of the profile, not of the screen', async () => {
    const { onSelect } = await renderLocation({
      profileLanguage: 'es',
      appLanguage: 'en',
    });

    fireEvent.change(screen.getByPlaceholderText('Find a location...'), {
      target: { value: 'Spain' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /España/ }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(requested('/suggest')[0].searchParams.get('language')).toBe('es');
    expect(requested('/retrieve')[0].searchParams.get('language')).toBe('es');
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      location: 'España, Europa',
      place: { name: 'España', country: 'España' },
    });
  });

  it('asks in English for a profile in English, even on a Spanish screen', async () => {
    await renderLocation({ profileLanguage: 'en', appLanguage: 'es' });

    fireEvent.change(screen.getByPlaceholderText('Buscar ubicación...'), {
      target: { value: 'Madrid' },
    });

    await waitFor(() => expect(requested('/suggest')).toHaveLength(1));
    expect(requested('/suggest')[0].searchParams.get('language')).toBe('en');
  });

  it('uses the language of the screen while the profile language is not known', async () => {
    await renderLocation({ appLanguage: 'es' });

    fireEvent.change(screen.getByPlaceholderText('Buscar ubicación...'), {
      target: { value: 'Madrid' },
    });

    await waitFor(() => expect(requested('/suggest')).toHaveLength(1));
    expect(requested('/suggest')[0].searchParams.get('language')).toBe('es');
  });

  describe('the names sent with the place', () => {
    async function choosePlace() {
      const { onSelect } = await renderLocation({
        profileLanguage: 'es',
        appLanguage: 'es',
      });
      fireEvent.change(screen.getByPlaceholderText('Buscar ubicación...'), {
        target: { value: 'Esp' },
      });
      fireEvent.click(await screen.findByRole('button', { name: /España/ }));
      await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
      return onSelect.mock.calls[0][0];
    }

    it('sends the place in both languages, with the profile language as the main one', async () => {
      const selection = await choosePlace();

      expect(selection.location).toBe('España, Europa');
      expect(selection.place).toMatchObject({
        name: 'España',
        country: 'España',
      });
      expect(selection.place.translations).toEqual([
        {
          locale: 'es',
          name: 'España',
          fullName: 'España, Europa',
          country: 'España',
          region: undefined,
          locality: undefined,
        },
        {
          locale: 'en',
          name: 'Spain',
          fullName: 'Spain, Europe',
          country: 'Spain',
          region: undefined,
          locality: undefined,
        },
      ]);
    });

    it('still lets the place be chosen, in one language, when the other cannot be loaded', async () => {
      answerPlaces('down');

      const selection = await choosePlace();

      expect(
        selection.place.translations.map(
          (item: { locale: string }) => item.locale,
        ),
      ).toEqual(['es']);
    });

    it('does not take a different place as the translation', async () => {
      answerPlaces('other place');

      const selection = await choosePlace();

      expect(
        selection.place.translations.map(
          (item: { locale: string }) => item.locale,
        ),
      ).toEqual(['es']);
    });
  });
});
