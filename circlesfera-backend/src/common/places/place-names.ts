/**
 * Shows the places of a response in one language.
 *
 * A response can carry places in two shapes, wherever it comes from (feed,
 * search, a profile, a story, the map):
 * - content with a place: an object with a `placeId` and a `location` label;
 * - a place itself: an object with an `id`, a `name` and coordinates.
 *
 * Both are found by shape, so every endpoint is covered without each one
 * having to remember to translate.
 */

export interface PlaceNames {
  name: string;
  fullName: string | null;
  country: string | null;
  region: string | null;
  locality: string | null;
}

// A response larger than this is left as it is: the walk must stay cheap.
const MAX_NODES = 20_000;

type Json = Record<string, unknown>;

const isPlain = (value: unknown): value is Json => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const isContentWithPlace = (node: Json) =>
  typeof node.placeId === 'string' && 'location' in node;

const isPlace = (node: Json) =>
  typeof node.id === 'string' &&
  typeof node.name === 'string' &&
  typeof node.latitude === 'number' &&
  typeof node.longitude === 'number';

/** The ids of every place a response mentions; empty when it is too large. */
export function collectPlaceIds(data: unknown): string[] {
  const ids = new Set<string>();
  const pending: unknown[] = [data];
  let seen = 0;

  while (pending.length > 0) {
    const node = pending.pop();
    if (++seen > MAX_NODES) return [];
    if (Array.isArray(node)) {
      for (const item of node) pending.push(item);
      continue;
    }
    if (!isPlain(node)) continue;
    if (isContentWithPlace(node)) ids.add(node.placeId as string);
    if (isPlace(node)) ids.add(node.id as string);
    for (const value of Object.values(node)) {
      if (value !== null && typeof value === 'object') pending.push(value);
    }
  }

  return [...ids];
}

/**
 * A copy of the response with the places it mentions named as given. Places
 * without names here keep theirs. The response itself is never changed: it
 * may be shared with other requests.
 */
export function applyPlaceNames<T>(
  data: T,
  namesByPlaceId: ReadonlyMap<string, PlaceNames>,
): T {
  if (namesByPlaceId.size === 0) return data;

  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!isPlain(node)) return node;

    const copy: Json = {};
    for (const [key, value] of Object.entries(node)) {
      copy[key] =
        value !== null && typeof value === 'object' ? visit(value) : value;
    }

    if (isContentWithPlace(node)) {
      const names = namesByPlaceId.get(node.placeId as string);
      if (names) copy.location = names.fullName || names.name;
    }
    if (isPlace(node)) {
      const names = namesByPlaceId.get(node.id as string);
      if (names) {
        copy.name = names.name;
        // The full name is not mixed with another language: without one the
        // name alone is shown.
        if ('fullName' in node) copy.fullName = names.fullName;
        if ('country' in node) copy.country = names.country ?? node.country;
        if ('region' in node) copy.region = names.region ?? node.region;
        if ('locality' in node) copy.locality = names.locality ?? node.locality;
      }
    }
    return copy;
  };

  return visit(data) as T;
}
