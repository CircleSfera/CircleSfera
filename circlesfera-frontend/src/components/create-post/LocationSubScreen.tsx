import type { PlaceInput } from '@circlesfera/shared';
import { motion } from 'framer-motion';
import { Loader2, MapPin, Navigation, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

export type PlaceSelection = {
  location: string;
  place: PlaceInput;
};

interface LocationSubScreenProps {
  onClose: () => void;
  onSelect: (selection: PlaceSelection) => void;
  onClear?: () => void;
  currentLocation?: string;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as
  | string
  | undefined;

// Generate a random UUID for the session token (Mapbox requirement)
const generateSessionToken = () => crypto.randomUUID();

export default function LocationSubScreen({
  onClose,
  onSelect,
  onClear,
  currentLocation = '',
}: LocationSubScreenProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGeoLoading, setIsGeoLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState(generateSessionToken());

  useEffect(() => {
    if (!query.trim() || !MAPBOX_TOKEN) {
      setSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const url = new URL(
          'https://api.mapbox.com/search/searchbox/v1/suggest',
        );
        url.searchParams.set('q', query);
        url.searchParams.set('access_token', MAPBOX_TOKEN);
        url.searchParams.set('session_token', sessionToken);
        url.searchParams.set('language', 'en');
        url.searchParams.set(
          'types',
          'country,region,postcode,district,place,locality,neighborhood,address,poi',
        );

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch (err) {
        console.error('Mapbox search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, sessionToken]);

  const handleSelectSuggestion = async (suggestion: any) => {
    if (!MAPBOX_TOKEN) return;

    setIsSearching(true);
    try {
      const url = new URL(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}`,
      );
      url.searchParams.set('access_token', MAPBOX_TOKEN);
      url.searchParams.set('session_token', sessionToken);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        const feature = data.features?.[0];

        if (feature) {
          const props = feature.properties;
          const coords = props.coordinates;
          const name = props.name_preferred || props.name;
          const fullName =
            props.full_address ||
            [props.name, props.place_formatted].filter(Boolean).join(', ') ||
            name;

          onSelect({
            location: fullName || name,
            place: {
              mapboxId: props.mapbox_id,
              name,
              fullName: fullName || undefined,
              latitude: coords.latitude,
              longitude: coords.longitude,
              country: props.context?.country?.name,
              region: props.context?.region?.name,
              locality:
                props.context?.locality?.name || props.context?.place?.name,
            },
          });

          // Reset session token after a successful retrieval
          setSessionToken(generateSessionToken());
        }
      }
    } catch {
      toast.error(t('createPost.location.retrieve_failed'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrent = () => {
    if (!MAPBOX_TOKEN) {
      toast.error(t('createPost.location.token_missing'));
      return;
    }
    if (!navigator.geolocation) {
      toast.error(t('createPost.location.geo_unsupported'));
      return;
    }
    setIsGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const url = new URL(
            `https://api.mapbox.com/search/searchbox/v1/reverse`,
          );
          url.searchParams.set('longitude', String(pos.coords.longitude));
          url.searchParams.set('latitude', String(pos.coords.latitude));
          url.searchParams.set('access_token', MAPBOX_TOKEN);
          url.searchParams.set('limit', '1');
          url.searchParams.set('language', 'en');

          const res = await fetch(url.toString());
          if (!res.ok) throw new Error('Reverse geocode failed');

          const data = await res.json();
          const feature = data.features?.[0];

          if (!feature) {
            toast.error(t('createPost.location.retrieve_failed'));
            return;
          }

          const props = feature.properties;
          const coords = props.coordinates;
          const name = props.name_preferred || props.name;
          const fullName =
            props.full_address ||
            [props.name, props.place_formatted].filter(Boolean).join(', ') ||
            name;

          onSelect({
            location: fullName || name,
            place: {
              mapboxId: props.mapbox_id,
              name,
              fullName: fullName || undefined,
              latitude: coords.latitude,
              longitude: coords.longitude,
              country: props.context?.country?.name,
              region: props.context?.region?.name,
              locality:
                props.context?.locality?.name || props.context?.place?.name,
            },
          });
        } catch {
          toast.error(t('createPost.location.retrieve_failed'));
        } finally {
          setIsGeoLoading(false);
        }
      },
      () => {
        setIsGeoLoading(false);
        toast.error(t('createPost.location.geo_denied'));
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  return (
    <div className={`${SUBSCREEN_SHELL}`}>
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md mx-auto h-full max-md:h-full bg-surface-elevated flex flex-col relative"
      >
        <SubScreenHeader
          title={t('createPost.location.title')}
          onClose={onClose}
          closeIcon="close"
        />

        <div className="p-4 relative z-10 flex flex-col flex-1 min-h-0">
          {!MAPBOX_TOKEN ? (
            <p className="text-[13px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 mb-4">
              {t('createPost.location.token_missing')}
            </p>
          ) : (
            <div className="space-y-4 flex flex-col flex-1 min-h-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('createPost.location.search')}
                  className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 focus:border-white/20 rounded-xl pl-10 pr-10 min-h-12 h-12 text-[14px] font-medium text-white placeholder-white/30 transition-all outline-none shadow-inner"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {suggestions.length > 0 && (
                <div className="flex-1 overflow-y-auto no-scrollbar rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10">
                  {suggestions.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion.mapbox_id}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex flex-col gap-0.5"
                    >
                      <span className="text-[14px] font-semibold text-white">
                        {suggestion.name}
                      </span>
                      <span className="text-[12px] text-white/50 truncate">
                        {suggestion.place_formatted}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {suggestions.length === 0 && query && !isSearching && (
                <div className="flex-1 flex items-center justify-center text-[13px] text-white/40 font-medium">
                  {t('modals.audio.no_results')}
                </div>
              )}

              {suggestions.length === 0 && !query && (
                <div className="flex-1 flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={isGeoLoading}
                    onClick={handleUseCurrent}
                    className="w-full min-h-12 h-12 flex items-center justify-center gap-2 px-4 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/20 transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50 shadow-sm shrink-0"
                  >
                    {isGeoLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Navigation size={16} />
                    )}
                    <span className="text-[14px] font-bold">
                      {isGeoLoading
                        ? t('createPost.location.geo_loading')
                        : t('createPost.location.use_current')}
                    </span>
                  </button>

                  {currentLocation && onClear && (
                    <button
                      type="button"
                      onClick={onClear}
                      className="w-full min-h-12 h-12 flex items-center justify-between gap-3 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[14px] font-semibold transition-all shrink-0"
                    >
                      <span className="truncate">{currentLocation}</span>
                      <span className="inline-flex items-center gap-1.5 shrink-0 bg-red-500/10 px-2 py-1 rounded-md text-[12px]">
                        <X size={14} aria-hidden />
                        {t('createPost.location.clear')}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 mt-auto text-[12px] font-medium text-white/40 flex items-start gap-2 shrink-0">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          <p>{t('createPost.location.mapbox_hint')}</p>
        </div>
      </motion.div>
    </div>
  );
}
