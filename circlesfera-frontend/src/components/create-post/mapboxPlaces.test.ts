import { describe, expect, it } from 'vitest';
import { loadPlaceSelection, type MapboxPlaceProperties } from './mapboxPlaces';

const place = (
  overrides: Partial<MapboxPlaceProperties> = {},
): MapboxPlaceProperties =>
  ({
    mapbox_id: 'mapbox-1',
    name: 'Cádiz',
    full_address: 'Cádiz, España',
    coordinates: { latitude: 36.5, longitude: -6.3 },
    context: { country: { name: 'España' } },
    ...overrides,
  }) as MapboxPlaceProperties;

describe('loadPlaceSelection', () => {
  it('cuts names to the lengths the server accepts, so a long address cannot block publishing', async () => {
    const long = (length: number) => 'a'.repeat(length);
    const selection = await loadPlaceSelection('es', async () =>
      place({
        name: long(250),
        full_address: long(400),
        context: {
          country: { name: long(150) },
          region: { name: long(150) },
          locality: { name: long(150) },
        },
      } as Partial<MapboxPlaceProperties>),
    );

    for (const names of selection?.place.translations ?? []) {
      expect(names.name).toHaveLength(200);
      expect(names.fullName).toHaveLength(300);
      expect(names.country).toHaveLength(120);
      expect(names.region).toHaveLength(120);
      expect(names.locality).toHaveLength(120);
    }
    expect(selection?.place.translations).toHaveLength(2);
  });

  it('leaves names within the limits as they are', async () => {
    const selection = await loadPlaceSelection('es', async () => place());

    expect(selection?.place.name).toBe('Cádiz');
    expect(selection?.place.fullName).toBe('Cádiz, España');
    expect(selection?.place.country).toBe('España');
    expect(selection?.place.region).toBeUndefined();
  });
});
