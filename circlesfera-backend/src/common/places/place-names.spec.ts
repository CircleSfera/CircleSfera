import { describe, expect, it } from 'vitest';
import {
  applyPlaceNames,
  collectPlaceIds,
  type PlaceNames,
} from './place-names.js';

const spain: PlaceNames = {
  name: 'España',
  fullName: 'España, Europa',
  country: 'España',
  region: null,
  locality: null,
};

const names = (entries: Record<string, PlaceNames>) =>
  new Map(Object.entries(entries));

const post = (over: Record<string, unknown> = {}): Record<string, any> => ({
  id: 'post-1',
  caption: 'Hola',
  placeId: 'place-1',
  location: 'Spain, Europe',
  ...over,
});

const place = (over: Record<string, unknown> = {}): Record<string, any> => ({
  id: 'place-1',
  mapboxId: 'mb.1',
  name: 'Spain',
  fullName: 'Spain, Europe',
  latitude: 40.4,
  longitude: -3.7,
  country: 'Spain',
  region: null,
  locality: null,
  ...over,
});

describe('collectPlaceIds', () => {
  it('finds the places of content anywhere in a response, once each', () => {
    const response = {
      data: [post(), post({ id: 'post-2' }), post({ placeId: 'place-2' })],
      meta: { total: 3 },
    };

    expect(collectPlaceIds(response).sort()).toEqual(['place-1', 'place-2']);
  });

  it('finds a place returned on its own and one nested in content', () => {
    expect(collectPlaceIds(place())).toEqual(['place-1']);
    expect(
      collectPlaceIds([
        post({ placeId: 'place-9', place: place({ id: 'place-9' }) }),
      ]),
    ).toEqual(['place-9']);
  });

  it('ignores content without a place and things that only look alike', () => {
    expect(
      collectPlaceIds([
        post({ placeId: null }),
        { id: 'profile-1', name: 'Ana', location: 'Madrid' },
        { id: 'x', name: 'No coordinates' },
        'text',
        42,
        null,
      ]),
    ).toEqual([]);
  });

  it('does not look inside dates or other built objects', () => {
    expect(
      collectPlaceIds({ createdAt: new Date(), buffer: Buffer.from('x') }),
    ).toEqual([]);
  });

  it('gives up on a response too large to walk cheaply', () => {
    const huge = Array.from({ length: 25_000 }, () => post());

    expect(collectPlaceIds(huge)).toEqual([]);
  });
});

describe('applyPlaceNames', () => {
  it('shows the label of content in the given language', () => {
    const result = applyPlaceNames([post()], names({ 'place-1': spain }));

    expect(result[0].location).toBe('España, Europa');
    expect(result[0].caption).toBe('Hola');
  });

  it('keeps a label that is none of the known labels of the place', () => {
    const known = { ...spain, labels: new Set(['Spain, Europe', 'Spain']) };

    const result = applyPlaceNames(
      [
        post({ location: 'Mi rincón favorito' }),
        post(),
        post({ location: '' }),
      ],
      names({ 'place-1': known }),
    );

    expect(result.map((item) => item.location)).toEqual([
      'Mi rincón favorito',
      'España, Europa',
      'España, Europa',
    ]);
  });

  it('uses the name alone when the place has no full name in that language', () => {
    const result = applyPlaceNames(
      post(),
      names({ 'place-1': { ...spain, fullName: null } }),
    );

    expect(result.location).toBe('España');
  });

  it('renames a place and the place nested in content', () => {
    const result = applyPlaceNames(
      post({ place: place() }),
      names({ 'place-1': spain }),
    );

    expect(result.place).toMatchObject({
      name: 'España',
      fullName: 'España, Europa',
      country: 'España',
      latitude: 40.4,
      mapboxId: 'mb.1',
    });
  });

  it('never shows a full name left over from another language', () => {
    const result = applyPlaceNames(
      place(),
      names({ 'place-1': { ...spain, fullName: null } }),
    );

    expect(result.name).toBe('España');
    expect(result.fullName).toBeNull();
  });

  it('keeps the saved country, region and locality where the language has none', () => {
    const result = applyPlaceNames(
      place({ region: 'Community of Madrid' }),
      names({ 'place-1': { ...spain, country: null } }),
    );

    expect(result.country).toBe('Spain');
    expect(result.region).toBe('Community of Madrid');
  });

  it('leaves places without names in that language as they were saved', () => {
    const result = applyPlaceNames(
      [post({ placeId: 'place-2' }), place({ id: 'place-2' })],
      names({ 'place-1': spain }),
    );

    expect(result[0].location).toBe('Spain, Europe');
    expect(result[1]).toMatchObject({ name: 'Spain' });
  });

  it('does not add fields a place did not have, such as a map pin', () => {
    const pin = {
      id: 'place-1',
      name: 'Spain',
      latitude: 40.4,
      longitude: -3.7,
    };

    const result = applyPlaceNames(pin, names({ 'place-1': spain }));

    expect(result).toEqual({
      id: 'place-1',
      name: 'España',
      latitude: 40.4,
      longitude: -3.7,
    });
  });

  it('never changes the response it was given, which may be shared', () => {
    const original = [post({ place: place() })];
    const snapshot = JSON.parse(JSON.stringify(original));

    const result = applyPlaceNames(original, names({ 'place-1': spain }));

    expect(original).toEqual(snapshot);
    expect(result).not.toBe(original);
  });

  it('returns the same response when there is nothing to rename', () => {
    const original = [post()];

    expect(applyPlaceNames(original, new Map())).toBe(original);
  });

  it('keeps dates and other built objects as they are', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');

    const result = applyPlaceNames(
      post({ createdAt }),
      names({ 'place-1': spain }),
    );

    expect(result.createdAt).toBe(createdAt);
  });
});
