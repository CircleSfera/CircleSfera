import type { PlaceInput, PlaceTranslationInput } from '@circlesfera/shared';
import type { AppLocale } from '../../utils/appLocale';

const SEARCH_BOX = 'https://api.mapbox.com/search/searchbox/v1';

/** The part of a map provider place that the app reads. */
export interface MapboxPlaceProperties {
  mapbox_id: string;
  name: string;
  name_preferred?: string;
  full_address?: string;
  place_formatted?: string;
  coordinates: { latitude: number; longitude: number };
  context?: {
    country?: { name?: string };
    region?: { name?: string };
    locality?: { name?: string };
    place?: { name?: string };
  };
}

export interface PlaceSelection {
  location: string;
  place: PlaceInput;
}

export const otherPlaceLanguage = (language: AppLocale): AppLocale =>
  language === 'es' ? 'en' : 'es';

// The server refuses a translation with a longer name, and with it the whole
// post or story, so the names are cut to its limits before they are sent.
const NAME_MAX = 200;
const FULL_NAME_MAX = 300;
const AREA_MAX = 120;

const clip = (value: string | undefined, max: number) =>
  value ? value.slice(0, max) : value;

function placeNames(props: MapboxPlaceProperties) {
  const name = props.name_preferred || props.name;
  const fullName =
    props.full_address ||
    [props.name, props.place_formatted].filter(Boolean).join(', ') ||
    name;
  return {
    name: name.slice(0, NAME_MAX),
    fullName: clip(fullName || undefined, FULL_NAME_MAX),
    country: clip(props.context?.country?.name, AREA_MAX),
    region: clip(props.context?.region?.name, AREA_MAX),
    locality: clip(
      props.context?.locality?.name || props.context?.place?.name,
      AREA_MAX,
    ),
  };
}

async function firstFeature(
  url: URL,
): Promise<MapboxPlaceProperties | undefined> {
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Place request failed: ${res.status}`);
  const data = await res.json();
  return data.features?.[0]?.properties;
}

/** The full data of a place chosen from the search, in one language. */
export function retrievePlace(options: {
  mapboxId: string;
  language: AppLocale;
  token: string;
  sessionToken: string;
}) {
  const url = new URL(`${SEARCH_BOX}/retrieve/${options.mapboxId}`);
  url.searchParams.set('access_token', options.token);
  url.searchParams.set('session_token', options.sessionToken);
  url.searchParams.set('language', options.language);
  return firstFeature(url);
}

/** The place at a position, in one language. */
export function reversePlace(options: {
  latitude: number;
  longitude: number;
  language: AppLocale;
  token: string;
}) {
  const url = new URL(`${SEARCH_BOX}/reverse`);
  url.searchParams.set('longitude', String(options.longitude));
  url.searchParams.set('latitude', String(options.latitude));
  url.searchParams.set('access_token', options.token);
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', options.language);
  return firstFeature(url);
}

/**
 * Loads a place in the language of the profile and, when it can, in the
 * other language of the app, so each person can be shown the place in their
 * own. The profile's language is required; the other one is a bonus and its
 * failure never blocks choosing the place.
 */
export async function loadPlaceSelection(
  language: AppLocale,
  load: (language: AppLocale) => Promise<MapboxPlaceProperties | undefined>,
): Promise<PlaceSelection | null> {
  const other = otherPlaceLanguage(language);
  const [primary, secondary] = await Promise.all([
    load(language),
    load(other).catch(() => undefined),
  ]);
  if (!primary) return null;

  const names = placeNames(primary);
  const translations: PlaceTranslationInput[] = [
    { locale: language, ...names },
  ];
  // Only the same place in the other language counts as its translation.
  if (secondary && secondary.mapbox_id === primary.mapbox_id) {
    translations.push({ locale: other, ...placeNames(secondary) });
  }

  return {
    location: names.fullName || names.name,
    place: {
      mapboxId: primary.mapbox_id,
      ...names,
      latitude: primary.coordinates.latitude,
      longitude: primary.coordinates.longitude,
      translations,
    },
  };
}
