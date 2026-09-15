import { describe, expect, it } from 'vitest';
import {
  buildPlaceDetailSubtitle,
  formatPlaceAreaParts,
} from './placeDetailFormat';

describe('formatPlaceAreaParts', () => {
  it('drops segments that repeat the place name', () => {
    expect(formatPlaceAreaParts('Madrid', ['Madrid', 'Madrid', 'Spain'])).toBe(
      'Spain',
    );
  });

  it('keeps distinct locality/region when they differ from the name', () => {
    expect(
      formatPlaceAreaParts('Retiro', [
        'Madrid',
        'Comunidad de Madrid',
        'Spain',
      ]),
    ).toBe('Madrid, Comunidad de Madrid, Spain');
  });
});

describe('buildPlaceDetailSubtitle', () => {
  it('uses posts count alone when area collapses to empty', () => {
    expect(
      buildPlaceDetailSubtitle({
        name: 'Madrid',
        locality: 'Madrid',
        region: 'Madrid',
        country: undefined,
        fullName: 'Madrid, Madrid',
        postCount: 1,
        postsLabel: '1 publicaciones',
      }),
    ).toBe('1 publicaciones');
  });

  it('joins cleaned area with posts count', () => {
    expect(
      buildPlaceDetailSubtitle({
        name: 'Madrid',
        locality: 'Madrid',
        region: 'Madrid',
        country: 'Spain',
        fullName: 'Madrid, Madrid, Spain',
        postCount: 1,
        postsLabel: '1 publicaciones',
      }),
    ).toBe('Spain · 1 publicaciones');
  });
});
