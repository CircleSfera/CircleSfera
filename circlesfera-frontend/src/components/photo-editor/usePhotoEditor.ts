import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { OverlayElement } from '../../services/edits.service';
import { clampFrameWindow } from '../../utils/frameClip';
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  PHOTO_FILTERS,
  type PhotoAdjustments,
} from './photoEditor.constants';
import {
  buildPhotoFilterString,
  photoAdjustmentsFilter,
} from './photoEditor.look';
import type {
  CropData,
  PhotoEditorSave,
  PhotoEditorTab,
  VideoData,
} from './photoEditor.types';

type Adjustments = PhotoAdjustments;
const DEFAULT_ADJUSTMENTS = DEFAULT_PHOTO_ADJUSTMENTS;
const FILTERS = PHOTO_FILTERS;

interface UsePhotoEditorOptions {
  image: File;
  onSave: PhotoEditorSave;
  onStateChange?: (state: any) => void;
  initialState?: any;
  initialTab?: PhotoEditorTab;
  constrainDuration?: { min: number; max: number };
  /** The shape of the small previews, as a CSS aspect ratio. */
  thumbnailRatio?: string;
}

/** Everything the photo editor remembers while it is open, and how it saves. */
export function usePhotoEditor({
  image,
  onSave,
  onStateChange,
  initialState,
  initialTab,
  constrainDuration,
  thumbnailRatio = '4 / 5',
}: UsePhotoEditorOptions) {
  const isVideo = image.type.startsWith('video');

  const [activeTab, setActiveTab] = useState<
    'FILTERS' | 'ADJUST' | 'CROP' | 'OVERLAY' | 'TRIM'
  >(
    initialTab && isVideo && initialTab === 'TRIM'
      ? 'TRIM'
      : initialTab || 'FILTERS',
  );

  const [selectedFilter, setSelectedFilter] = useState(
    initialState?.filter
      ? FILTERS.find((f) => f.class === initialState.filter) || FILTERS[0]
      : FILTERS[0],
  );

  const [adjustments, setAdjustments] = useState<Adjustments>(
    initialState?.adjustments || DEFAULT_ADJUSTMENTS,
  );

  const [activeAdjustment, setActiveAdjustment] =
    useState<keyof Adjustments>('brightness');

  // Crop state
  const [crop, setCrop] = useState(
    initialState?.cropData
      ? { x: initialState.cropData.x, y: initialState.cropData.y }
      : { x: 0, y: 0 },
  );
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(
    initialState?.cropData?.rotation || 0,
  );
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropData | null>(
    initialState?.cropData || null,
  );

  const [overlays, setOverlays] = useState<OverlayElement[]>(
    initialState?.overlays || [],
  );
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(
    null,
  );

  const [drawMode, setDrawMode] = useState(false);
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(5);

  const [videoData, setVideoData] = useState({
    startTime: initialState?.videoData?.startTime || 0,
    endTime: initialState?.videoData?.endTime || 0, // 0 means end of video initially
    muted: initialState?.videoData?.muted || false,
  });

  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<any>(null);
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDims = () => {
      if (imageRef.current) {
        setImageDims({
          width: imageRef.current.clientWidth,
          height: imageRef.current.clientHeight,
        });
      }
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []); // Re-calculate when tabs change

  const onCropComplete = useCallback(
    (_croppedArea: any, croppedAreaPixels: any) => {
      setCroppedAreaPixels({ ...croppedAreaPixels, rotation });
    },
    [rotation],
  );

  // The browser keeps a file in memory for as long as an address points to
  // it, so the address is made once per file and released when the editor
  // closes or the file changes. It is set before the first paint.
  const [previewUrl, setPreviewUrl] = useState('');
  useLayoutEffect(() => {
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  // Filters are previewed on the file itself, or on a frame of the video.
  const [videoFrameUrl, setVideoFrameUrl] = useState<string | null>(null);
  const thumbnailUrl = videoFrameUrl ?? previewUrl;
  // Auto-save effect
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        filter: selectedFilter.class,
        adjustments,
        cropData: croppedAreaPixels,
        overlays,
      });
    }
  }, [selectedFilter, adjustments, croppedAreaPixels, overlays, onStateChange]);

  const isAdjusted =
    JSON.stringify(adjustments) !== JSON.stringify(DEFAULT_ADJUSTMENTS);

  // Generate thumbnail for video files
  useEffect(() => {
    if (isVideo && previewUrl) {
      const video = document.createElement('video');
      video.src = previewUrl;
      video.muted = true;
      video.playsInline = true;
      video.currentTime = 0.1;

      const captureFrame = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setVideoFrameUrl(canvas.toDataURL());
        }
      };

      video.onloadeddata = () => {
        video.currentTime = 0.1;
        if (videoData.endTime === 0) {
          const sourceSec = video.duration;
          if (constrainDuration) {
            const clipped = clampFrameWindow(
              sourceSec,
              0,
              Math.min(constrainDuration.max, sourceSec),
            );
            setVideoData((v) => ({
              ...v,
              startTime: clipped.startTime,
              endTime: clipped.endTime,
            }));
          } else {
            setVideoData((v) => ({ ...v, endTime: sourceSec }));
          }
        }
      };
      video.onseeked = () => {
        captureFrame();
      };
    }
  }, [previewUrl, isVideo, videoData.endTime, constrainDuration]);

  // Video loop handling
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return;

    const handleTimeUpdate = () => {
      if (videoData.endTime > 0 && v.currentTime >= videoData.endTime) {
        v.currentTime = videoData.startTime;
        v.play();
      }
    };
    v.addEventListener('timeupdate', handleTimeUpdate);
    return () => v.removeEventListener('timeupdate', handleTimeUpdate);
  }, [videoData.startTime, videoData.endTime, isVideo]);

  const computedStyle = useMemo(
    () => ({ filter: photoAdjustmentsFilter(adjustments) }),
    [adjustments],
  );
  const filterString = buildPhotoFilterString(
    selectedFilter.class,
    adjustments,
  );

  const handleSave = () => {
    let overlayDataUrl: string | undefined;
    if (stageRef.current) {
      // Export at double resolution for crispness, but this depends on original image
      // Let's just do pixelRatio: 2 for now, or match it to the ratio of naturalWidth / displayWidth
      const pixelRatio = imageRef.current
        ? imageRef.current.naturalWidth / imageDims.width
        : 2;
      overlayDataUrl = stageRef.current.toDataURL({ pixelRatio });
    }
    let nextVideoData: VideoData | undefined = isVideo ? videoData : undefined;
    if (isVideo && constrainDuration && nextVideoData) {
      const sourceSec = videoRef.current?.duration || nextVideoData.endTime;
      const clipped = clampFrameWindow(
        sourceSec,
        nextVideoData.startTime,
        nextVideoData.endTime - nextVideoData.startTime,
      );
      nextVideoData = {
        ...nextVideoData,
        startTime: clipped.startTime,
        endTime: clipped.endTime,
      };
    }
    onSave(
      image,
      filterString,
      croppedAreaPixels || undefined,
      overlayDataUrl,
      nextVideoData,
    );
  };

  return {
    isVideo,
    constrainDuration,
    activeTab,
    setActiveTab,
    selectedFilter,
    setSelectedFilter,
    adjustments,
    setAdjustments,
    activeAdjustment,
    setActiveAdjustment,
    isAdjusted,
    crop,
    setCrop,
    zoom,
    setZoom,
    rotation,
    setRotation,
    aspect,
    setAspect,
    onCropComplete,
    overlays,
    setOverlays,
    selectedOverlayId,
    setSelectedOverlayId,
    drawMode,
    setDrawMode,
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    videoData,
    setVideoData,
    imageRef,
    videoRef,
    stageRef,
    imageDims,
    previewUrl,
    thumbnailUrl,
    thumbnailRatio,
    computedStyle,
    filterString,
    handleSave,
  };
}

export type PhotoEditorState = ReturnType<typeof usePhotoEditor>;
