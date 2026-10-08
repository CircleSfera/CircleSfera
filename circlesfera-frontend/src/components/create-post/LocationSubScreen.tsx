import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, MapPin, Navigation, Search, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuthStore } from '../../stores/authStore';
import { toAppLocale } from '../../utils/appLocale';
import { SUBSCREEN_SHELL } from './ComposerChrome';
import {
  loadPlaceSelection,
  type PlaceSelection,
  retrievePlace,
  reversePlace,
} from './mapboxPlaces';
import { SearchError, SearchMessage } from './SearchState';
import SubScreenHeader from './SubScreenHeader';

export type { PlaceSelection } from './mapboxPlaces';

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
  const { t, i18n } = useTranslation();
  // Places are searched and saved in the language of the profile: the name
  // chosen here is stored with the post and shown to everyone. The account
  // language is the profile's; the app language stands in until it is known.
  const accountLocale = useAuthStore((state) => state.profile?.user?.locale);
  const placeLanguage = toAppLocale(
    accountLocale ?? i18n.resolvedLanguage ?? i18n.language,
  );
  const [query, setQuery] = useState('');
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [isGeoLoading, setIsGeoLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState(generateSessionToken());

  // Searching from the first key press, so "no locations" never shows before
  // the search has run.
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, 300);
  const canSearch = Boolean(MAPBOX_TOKEN) && debouncedQuery.length > 0;
  const {
    data: foundPlaces,
    isFetching,
    isError: searchFailed,
    refetch: retrySearch,
  } = useQuery({
    queryKey: [
      'composer',
      'places',
      debouncedQuery,
      sessionToken,
      placeLanguage,
    ],
    queryFn: async (): Promise<any[]> => {
      const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
      url.searchParams.set('q', debouncedQuery);
      url.searchParams.set('access_token', MAPBOX_TOKEN ?? '');
      url.searchParams.set('session_token', sessionToken);
      url.searchParams.set('language', placeLanguage);
      url.searchParams.set(
        'types',
        'country,region,postcode,district,place,locality,neighborhood,address,poi',
      );

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Place search failed: ${res.status}`);
      const data = await res.json();
      return data.suggestions || [];
    },
    enabled: canSearch,
    placeholderData: keepPreviousData,
  });
  const isSearching =
    Boolean(MAPBOX_TOKEN) &&
    trimmedQuery.length > 0 &&
    (trimmedQuery !== debouncedQuery || isFetching);
  // Results kept from the previous search must not outlive the text.
  const suggestions = trimmedQuery ? (foundPlaces ?? []) : [];

  const handleSelectSuggestion = async (suggestion: any) => {
    const token = MAPBOX_TOKEN;
    if (!token) return;

    setIsRetrieving(true);
    try {
      const selection = await loadPlaceSelection(placeLanguage, (language) =>
        retrievePlace({
          mapboxId: suggestion.mapbox_id,
          language,
          token,
          sessionToken,
        }),
      );
      if (selection) {
        onSelect(selection);
        // Reset session token after a successful retrieval
        setSessionToken(generateSessionToken());
      }
    } catch {
      toast.error(t('createPost.location.retrieve_failed'));
    } finally {
      setIsRetrieving(false);
    }
  };

  const handleUseCurrent = () => {
    const token = MAPBOX_TOKEN;
    if (!token) {
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
          const selection = await loadPlaceSelection(
            placeLanguage,
            (language) =>
              reversePlace({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                language,
                token,
              }),
          );
          if (!selection) {
            toast.error(t('createPost.location.retrieve_failed'));
            return;
          }
          onSelect(selection);
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
        />

        <div className="p-4 relative z-10 flex flex-col flex-1 min-h-0">
          {!MAPBOX_TOKEN ? (
            <p className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 mb-4">
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
                  className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 focus:border-white/20 rounded-2xl pl-10 pr-12 min-h-12 h-12 text-base text-white placeholder-white/30 transition-all outline-none shadow-inner"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label={t('createPost.location.clear_search')}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-white/50 hover:text-white rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
              </div>

              {suggestions.length > 0 && (
                <div className="min-h-0 overflow-y-auto no-scrollbar rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10">
                  {suggestions.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion.mapbox_id}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      disabled={isRetrieving}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex flex-col gap-0.5 disabled:opacity-50"
                    >
                      <span className="text-sm font-semibold text-white">
                        {suggestion.name}
                      </span>
                      <span className="text-xs text-white/50 truncate">
                        {suggestion.place_formatted}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {suggestions.length === 0 && query && isSearching && (
                <SearchMessage busy>
                  {t('createPost.tags.searching')}
                </SearchMessage>
              )}

              {searchFailed && !isSearching && (
                <SearchError
                  message={t('createPost.location.search_error')}
                  onRetry={() => retrySearch()}
                />
              )}

              {suggestions.length === 0 &&
                query &&
                !isSearching &&
                !searchFailed && (
                  <SearchMessage>
                    <span className="text-white/70">
                      {t('createPost.location.not_found')}
                    </span>
                    <span className="text-xs text-white/45">
                      {t('createPost.location.try_different')}
                    </span>
                  </SearchMessage>
                )}

              {suggestions.length === 0 && !query && (
                <div className="flex-1 flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={isGeoLoading}
                    onClick={handleUseCurrent}
                    className="w-full min-h-12 h-12 flex items-center justify-center gap-2 px-4 rounded-full bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/20 transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50 shadow-sm shrink-0"
                  >
                    {isGeoLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Navigation size={16} />
                    )}
                    <span className="text-sm font-bold">
                      {isGeoLoading
                        ? t('createPost.location.geo_loading')
                        : t('createPost.location.use_current')}
                    </span>
                  </button>

                  {currentLocation && onClear && (
                    <button
                      type="button"
                      onClick={onClear}
                      className="w-full min-h-12 h-12 flex items-center justify-between gap-3 px-4 rounded-full bg-brand-secondary/10 hover:bg-brand-secondary/20 text-brand-secondary border border-brand-secondary/20 text-sm font-semibold transition-all shrink-0"
                    >
                      <span className="truncate">{currentLocation}</span>
                      <span className="inline-flex items-center gap-1.5 shrink-0 bg-brand-secondary/10 px-2 py-1 rounded-full text-xs">
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

        <div className="px-4 pb-4 mt-auto text-xs font-medium text-white/40 flex items-start gap-2 shrink-0">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          <p>{t('createPost.location.mapbox_hint')}</p>
        </div>
      </motion.div>
    </div>
  );
}
