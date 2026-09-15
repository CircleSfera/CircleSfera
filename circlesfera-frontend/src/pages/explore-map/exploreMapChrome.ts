import { formatPlaceAreaParts } from '../../components/explore-map/placeDetailFormat';
import type { PlaceMapPin } from '../../types';

/** Shared glass chrome for Explore discovery map FABs / pills / chips. */
export const MAP_FAB_CLASS =
  'pointer-events-auto w-11 h-11 rounded-full bg-black/55 text-white hover:bg-black/70 border border-white/10 shrink-0';

export const MAP_GLASS_PILL_CLASS =
  'rounded-full bg-black/55 border border-white/12 backdrop-blur-md';

export const MAP_CHIP_CLASS =
  'pointer-events-auto inline-flex items-center justify-center gap-2 h-11 min-w-[44px] px-5 rounded-full bg-black/55 backdrop-blur-md border border-white/12 text-white text-sm font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.45)] hover:bg-black/70 active:scale-[0.98] transition-all';

function placeAreaLabel(
  place: Pick<
    PlaceMapPin,
    'name' | 'locality' | 'region' | 'country' | 'fullName'
  >,
): string | null {
  const fromParts = formatPlaceAreaParts(place.name, [
    place.locality,
    place.region,
    place.country,
  ]);
  if (fromParts) return fromParts;

  if (place.fullName?.trim()) {
    const segments = place.fullName.split(',').map((s) => s.trim());
    const cleaned = formatPlaceAreaParts(place.name, segments);
    if (cleaned) return cleaned;
  }

  return null;
}

/**
 * Real locality for sheet subtitle only. Never returns the generic "Esta zona"
 * fallback — callers omit the subtitle when this is null.
 * Dedupes repeated locality/region segments (e.g. Madrid, Madrid, Spain → Spain).
 */
export function meaningfulAreaLabel(
  places: PlaceMapPin[],
  selectedPin: PlaceMapPin | null,
): string | null {
  if (selectedPin) {
    const label = placeAreaLabel(selectedPin);
    if (label) return label;
  }
  for (const place of places) {
    const label = placeAreaLabel(place);
    if (label) return label;
  }
  return null;
}
