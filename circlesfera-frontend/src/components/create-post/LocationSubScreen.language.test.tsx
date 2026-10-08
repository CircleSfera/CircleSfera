import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';

const fetchMock = vi.fn();

const suggestion = {
  mapbox_id: 'place-1',
  name: 'España',
  place_formatted: 'Europa',
};
const feature = {
  properties: {
    mapbox_id: 'place-1',
    name: 'España',
    place_formatted: 'Europa',
    coordinates: { latitude: 40.4, longitude: -3.7 },
    context: { country: { name: 'España' } },
  },
};

function answerPlaces() {
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes('/suggest')
        ? { suggestions: [suggestion] }
        : { features: [feature] },
  }));
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
});
