import mapboxgl from 'mapbox-gl';
import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, LocateFixed, MapPin } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import MapBottomSheet from '../../components/explore-map/MapBottomSheet';
import PlaceDetailSheet from '../../components/explore-map/PlaceDetailSheet';
import PlacesPeekList from '../../components/explore-map/PlacesPeekList';
import { buildPlaceMarkerElement } from '../../components/explore-map/placeMapMarker';
import { Button } from '../../components/ui';
import { placesApi } from '../../services';
import type { PlaceMapPin } from '../../types';
import {
  MAP_CHIP_CLASS,
  MAP_FAB_CLASS,
  MAP_GLASS_PILL_CLASS,
  meaningfulAreaLabel,
} from './exploreMapChrome';

// Vite bundles the Mapbox worker separately — without this, tiles often stay blank.
mapboxgl.workerClass = MapboxWorker as unknown as typeof mapboxgl.workerClass;

const DEFAULT_CENTER: [number, number] = [-3.7038, 40.4168]; // Madrid
const DEFAULT_ZOOM = 11;

type Bbox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

function boundsToBbox(bounds: mapboxgl.LngLatBounds): Bbox {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return {
    minLat: sw.lat,
    maxLat: ne.lat,
    minLng: sw.lng,
    maxLng: ne.lng,
  };
}

function getMapboxToken(): string | undefined {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
  return token?.trim() ? token : undefined;
}

export default function ExploreMapPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [pendingBbox, setPendingBbox] = useState<Bbox | null>(null);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapboxToken = getMapboxToken();

  const {
    data: pinsResponse,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['places', 'map', bbox],
    queryFn: async () => {
      if (!bbox) return { data: [] as PlaceMapPin[] };
      const res = await placesApi.getMap({ ...bbox, limit: 50 });
      return res.data;
    },
    enabled: Boolean(bbox) && Boolean(mapboxToken),
  });

  const places = pinsResponse?.data ?? [];

  const selectedPin = useMemo(
    () => places.find((p) => p.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );

  const areaLabel = useMemo(
    () => meaningfulAreaLabel(places, selectedPin),
    [places, selectedPin],
  );

  const syncMarkers = useCallback(
    (pins: PlaceMapPin[], selectedId: string | null) => {
      const map = mapRef.current;
      if (!map) return;

      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];

      for (const place of pins) {
        const el = buildPlaceMarkerElement({
          place,
          selected: place.id === selectedId,
          moreLabel: t('explore.map.more_count'),
          onSelect: (id) => {
            setSelectedPlaceId(id);
            setPeekOpen(false);
          },
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([place.longitude, place.latitude])
          .addTo(map);
        markersRef.current.push(marker);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!mapboxToken || !mapContainerRef.current || mapRef.current) return;

    setMapError(null);
    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-left',
    );

    const resize = () => {
      map.resize();
    };

    map.on('load', () => {
      resize();
      setMapReady(true);
      const bounds = map.getBounds();
      if (!bounds) return;
      const next = boundsToBbox(bounds);
      setBbox(next);
      setPendingBbox(next);
    });

    map.on('error', (event) => {
      const message =
        event.error?.message || t('explore.map.render_error_hint');
      setMapError(message);
    });

    map.on('moveend', () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const next = boundsToBbox(bounds);
      setPendingBbox(next);
      setShowSearchArea(true);
    });

    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(mapContainerRef.current);
    window.addEventListener('resize', resize);

    mapRef.current = map;

    return () => {
      window.removeEventListener('resize', resize);
      observer.disconnect();
      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapboxToken, t]);

  useEffect(() => {
    if (!mapReady) return;
    syncMarkers(places, selectedPlaceId);
  }, [places, selectedPlaceId, mapReady, syncMarkers]);

  const handleSearchArea = () => {
    if (!pendingBbox) return;
    setBbox(pendingBbox);
    setShowSearchArea(false);
    void refetch();
  };

  const handleRecenter = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.easeTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: Math.max(mapRef.current.getZoom(), 12),
          duration: 800,
        });
      },
      () => {
        // Permission denied or unavailable — keep current view
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  if (!mapboxToken) {
    return (
      <div className="h-full min-h-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-black">
        <MapPin className="text-white/40" size={40} />
        <p className="text-white font-semibold">
          {t('explore.map.token_missing')}
        </p>
        <p className="text-sm text-white/55 max-w-sm">
          {t('explore.map.token_missing_hint')}
        </p>
        <Button variant="secondary" onClick={() => navigate('/explore')}>
          {t('explore.map.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full bg-black overflow-hidden">
      {/*
        Mapbox sets `.mapboxgl-map { position: relative }`, which overrides Tailwind
        `absolute inset-0` and collapses height to 0. Give the map an explicit h-full
        wrapper so tiles fill the viewport.
      */}
      <div className="absolute inset-0">
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>

      {mapError ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-6 text-center bg-black/85">
          <MapPin className="text-white/40" size={36} />
          <p className="text-white font-semibold">
            {t('explore.map.render_error')}
          </p>
          <p className="text-sm text-white/55 max-w-sm">{mapError}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setMapError(null);
              mapRef.current?.remove();
              mapRef.current = null;
              setMapReady(false);
              // Remount by toggling token dependency via forced remount key is heavier;
              // reload is the reliable recovery path for Mapbox GL failures.
              window.location.reload();
            }}
          >
            {t('explore.map.retry')}
          </Button>
        </div>
      ) : null}

      <div className="absolute top-0 left-0 right-0 z-20 pt-[env(safe-area-inset-top,0px)] pointer-events-none">
        <div className="relative flex items-center justify-between gap-2 px-3 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('explore.map.back')}
            onClick={() => navigate('/explore')}
            className={MAP_FAB_CLASS}
          >
            <ChevronLeft size={22} />
          </Button>

          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 max-w-[min(58vw,260px)] text-center px-2">
            {showSearchArea ? (
              <Button
                type="button"
                variant="white"
                size="compact"
                onClick={handleSearchArea}
                disabled={isFetching}
                className="pointer-events-auto h-10 px-4 rounded-full text-sm shadow-lg"
              >
                {isFetching
                  ? t('explore.map.searching')
                  : t('explore.map.search_area')}
              </Button>
            ) : (
              <div className={`${MAP_GLASS_PILL_CLASS} px-3.5 py-2`}>
                <p className="text-[13px] font-bold text-white leading-tight truncate">
                  {t('explore.map.page_title')}
                </p>
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('explore.map.recenter')}
            onClick={handleRecenter}
            className={`${MAP_FAB_CLASS} ml-auto`}
          >
            <LocateFixed size={20} />
          </Button>
        </div>
      </div>

      {!selectedPlaceId && peekOpen ? (
        <MapBottomSheet
          isOpen={peekOpen}
          onClose={() => setPeekOpen(false)}
          title={t('explore.map.title')}
          subtitle={areaLabel ?? undefined}
          maxHeightClass={
            places.length > 0
              ? 'max-h-[min(48%,420px)]'
              : 'max-h-[min(42%,360px)]'
          }
          desktopWidthClass="md:w-[min(100%-2rem,360px)]"
          titleId="explore-map-peek-title"
        >
          <PlacesPeekList
            places={places}
            emptyLabel={t('explore.map.empty')}
            emptyHint={t('explore.map.empty_hint')}
            emptyCtaLabel={t('explore.map.empty_cta')}
            postsLabel={(count) => t('explore.map.posts_count', { count })}
            onSelectPlace={(id) => {
              setSelectedPlaceId(id);
              setPeekOpen(false);
            }}
          />
        </MapBottomSheet>
      ) : null}

      {!selectedPlaceId && !peekOpen ? (
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(12px,env(safe-area-inset-bottom,12px))] px-4 pointer-events-none flex justify-center">
          <button
            type="button"
            onClick={() => setPeekOpen(true)}
            data-testid="explore-map-places-chip"
            className={MAP_CHIP_CLASS}
          >
            <MapPin size={16} className="text-white/80 shrink-0" aria-hidden />
            <span>
              {places.length > 0
                ? t('explore.map.places_chip', { count: places.length })
                : t('explore.map.show_places')}
            </span>
          </button>
        </div>
      ) : null}

      <PlaceDetailSheet
        placeId={selectedPlaceId}
        fallbackPin={selectedPin}
        onClose={() => {
          setSelectedPlaceId(null);
          setPeekOpen(true);
        }}
      />
    </div>
  );
}
