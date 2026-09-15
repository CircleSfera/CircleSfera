import { describe, expect, it } from 'vitest';
import type { PlaceMapPin } from '../../types';
import { meaningfulAreaLabel } from './exploreMapChrome';

function pin(
  partial: Partial<PlaceMapPin> & { id: string; name: string },
): PlaceMapPin {
  return {
    mapboxId: `mb-${partial.id}`,
    latitude: 40,
    longitude: -3,
    postCount: 1,
    previewMedia: [],
    creators: [],
    ...partial,
  };
}

describe('meaningfulAreaLabel', () => {
  it('returns null when no place has locality/region/country', () => {
    expect(meaningfulAreaLabel([], null)).toBeNull();
    expect(
      meaningfulAreaLabel([pin({ id: '1', name: 'Park' })], null),
    ).toBeNull();
  });

  it('prefers the selected pin area when present', () => {
    const selected = pin({
      id: '2',
      name: 'Plaza',
      locality: 'Madrid',
      country: 'España',
    });
    const other = pin({
      id: '1',
      name: 'Park',
      locality: 'Valencia',
    });
    expect(meaningfulAreaLabel([other, selected], selected)).toBe(
      'Madrid, España',
    );
  });

  it('dedupes repeated locality/region for area labels', () => {
    expect(
      meaningfulAreaLabel(
        [
          pin({
            id: '1',
            name: 'Madrid',
            locality: 'Madrid',
            region: 'Madrid',
            country: 'Spain',
          }),
        ],
        null,
      ),
    ).toBe('Spain');
  });

  it('falls back to the first place with area data', () => {
    expect(
      meaningfulAreaLabel(
        [
          pin({ id: '1', name: 'A' }),
          pin({ id: '2', name: 'B', region: 'Comunidad de Madrid' }),
        ],
        null,
      ),
    ).toBe('Comunidad de Madrid');
  });
});
