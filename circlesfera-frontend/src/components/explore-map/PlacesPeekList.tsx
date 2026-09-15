import { MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PlaceMapPin } from '../../types';
import { Button } from '../ui';
import { formatPlaceAreaParts } from './placeDetailFormat';

type PlacesPeekListProps = {
  places: PlaceMapPin[];
  emptyLabel: string;
  emptyHint?: string;
  emptyCtaLabel?: string;
  postsLabel: (count: number) => string;
  onSelectPlace: (placeId: string) => void;
};

function rowMeta(place: PlaceMapPin): string {
  const fromParts = formatPlaceAreaParts(place.name, [
    place.locality,
    place.region,
    place.country,
  ]);
  if (fromParts) return fromParts;
  if (place.fullName?.trim()) {
    const segments = place.fullName.split(',').map((s) => s.trim());
    return formatPlaceAreaParts(place.name, segments);
  }
  return '';
}

export default function PlacesPeekList({
  places,
  emptyLabel,
  emptyHint,
  emptyCtaLabel,
  postsLabel,
  onSelectPlace,
}: PlacesPeekListProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-5">
        {places.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-4 py-8 gap-3 min-h-[168px]">
            <div className="w-12 h-12 rounded-2xl bg-white/6 border border-white/10 flex items-center justify-center">
              <MapPin size={22} className="text-brand-primary" aria-hidden />
            </div>
            <div className="space-y-1.5 max-w-xs">
              <p className="text-sm font-semibold text-white/85">
                {emptyLabel}
              </p>
              {emptyHint ? (
                <p className="text-xs text-white/40 leading-relaxed">
                  {emptyHint}
                </p>
              ) : null}
            </div>
            {emptyCtaLabel ? (
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="mt-2 mb-1 rounded-full"
                onClick={() => navigate('/create')}
              >
                {emptyCtaLabel}
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {places.map((place) => {
              const thumb =
                place.markerImageUrl || place.previewMedia?.[0] || null;
              const meta = rowMeta(place);
              return (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPlace(place.id)}
                    className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/6 active:bg-white/10 transition-colors min-h-14"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/8 border border-white/10 shrink-0">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MapPin
                            size={18}
                            className="text-white/35"
                            aria-hidden
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate leading-tight">
                        {place.name}
                      </p>
                      {meta ? (
                        <p className="text-[11px] text-white/45 truncate mt-0.5">
                          {meta}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-[11px] font-semibold text-white/55 tabular-nums shrink-0 pl-1">
                      {postsLabel(place.postCount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
