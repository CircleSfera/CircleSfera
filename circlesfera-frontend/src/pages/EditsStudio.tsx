import {
  Music,
  Plus,
  Scissors,
  Trash2,
  Type,
  Video,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import StudioPlaybackControls from '../components/studio/layout/StudioPlaybackControls';
import StudioToolDock from '../components/studio/layout/StudioToolDock';
import StudioToolSheet from '../components/studio/layout/StudioToolSheet';
import StudioTopbar from '../components/studio/layout/StudioTopbar';
import DraftsModal from '../components/studio/modals/DraftsModal';
import ExportModal from '../components/studio/modals/ExportModal';
import StudioPlayer from '../components/studio/StudioPlayer';
import Timeline from '../components/studio/Timeline';
import { useStudioAutosave } from '../hooks/useStudioAutosave';
import { uploadApi } from '../services/upload.service';
import { useStudioStore } from '../stores/studioStore';
import type { MediaClip, StudioProject, Track } from '../types/studio';
import { exportStudioProject } from '../utils/ffmpegExport';
import {
  type FfmpegEncodePreset,
  StudioExportError,
} from '../utils/studioExportHelpers';
import { loadLocalStudioDraft } from '../utils/studioLocalDraft';
import { getPrimaryMediaUrl } from '../utils/studioProject';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);

function createBlankProject(t: (key: string) => string): StudioProject {
  return {
    id: generateId(),
    name: t('studio.default_project_name'),
    duration: 10,
    fps: 30,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    tracks: [
      {
        id: generateId(),
        type: 'video',
        name: t('studio.tracks.video'),
        clips: [],
        muted: false,
        hidden: false,
        locked: false,
      },
      {
        id: generateId(),
        type: 'text',
        name: t('studio.tracks.text'),
        clips: [],
        muted: false,
        hidden: false,
        locked: false,
      },
      {
        id: generateId(),
        type: 'audio',
        name: t('studio.tracks.audio'),
        clips: [],
        muted: false,
        hidden: false,
        locked: false,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function Studio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { saveNow } = useStudioAutosave();

  const {
    project,
    setProject,
    setCloudProjectId,
    addClip,
    addTrack,
    splitClip,
    removeClip,
    selectedClipId,
    zoom,
    setZoom,
    playhead,
    setPlayhead,
    togglePlayback,
    setPlaying,
    undo,
    redo,
    updateClip,
  } = useStudioStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const exportAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (useStudioStore.getState().project) {
        setHydrated(true);
        return;
      }
      const local = await loadLocalStudioDraft();
      if (cancelled) return;
      if (local?.project) {
        setProject(local.project);
        if (local.cloudProjectId) setCloudProjectId(local.cloudProjectId);
      } else {
        setProject(createBlankProject(t));
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setProject, setCloudProjectId, t]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const store = useStudioStore.getState();
      const fps = store.project?.fps || 30;
      const frame = 1 / fps;

      if (e.code === 'Space' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlayback();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPlaying(false);
        setPlayhead(Math.max(0, useStudioStore.getState().playhead - frame));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        const state = useStudioStore.getState();
        const max = state.project?.duration ?? state.playhead + frame;
        setPlayhead(Math.min(max, state.playhead + frame));
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setPlaying(false);
        setPlayhead(Math.max(0, useStudioStore.getState().playhead - 1));
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setPlaying(false);
        const state = useStudioStore.getState();
        const max = state.project?.duration ?? state.playhead + 1;
        setPlayhead(Math.min(max, state.playhead + 1));
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(Math.min(200, useStudioStore.getState().zoom + 10));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(Math.max(10, useStudioStore.getState().zoom - 10));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        useStudioStore.getState().setOpenSheet(null);
      } else if (e.key.toLowerCase() === 'e' && !isExporting) {
        e.preventDefault();
        setExportedBlob(null);
        setExportProgress(0);
        setShowExportModal(true);
      } else if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
        undo();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
        redo();
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedClipId
      ) {
        e.preventDefault();
        removeClip(selectedClipId);
      } else if (e.key.toLowerCase() === 's' && selectedClipId) {
        e.preventDefault();
        splitClip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlayback,
    undo,
    redo,
    selectedClipId,
    removeClip,
    splitClip,
    setPlayhead,
    setPlaying,
    setZoom,
    isExporting,
  ]);

  const uploadAndResolveUrl = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await uploadApi.upload(formData);
      return data.url;
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddMediaFile = async (file: File) => {
    if (!project) return;
    const isVideo = file.type.startsWith('video');
    const trackId =
      project.tracks.find((tr) => tr.type === 'video')?.id ||
      project.tracks[0].id;

    const localUrl = URL.createObjectURL(file);
    const clipId = generateId();

    try {
      if (isVideo) {
        const duration = await new Promise<number>((resolve, reject) => {
          const videoEl = document.createElement('video');
          videoEl.src = localUrl;
          videoEl.onloadedmetadata = () => resolve(videoEl.duration);
          videoEl.onerror = () => reject(new Error('metadata'));
        });

        const newClip: MediaClip = {
          id: clipId,
          trackId,
          type: 'video',
          file,
          fileUrl: localUrl,
          startAt: playhead,
          duration,
          mediaStart: 0,
          speed: 1,
          volume: 1,
          muted: false,
          transform: { scale: 1, rotation: 0, x: 0, y: 0 },
        };
        addClip(trackId, newClip);
        toast.success(t('studio.media.video_added'));

        const remoteUrl = await uploadAndResolveUrl(file);
        updateClip(clipId, { fileUrl: remoteUrl, file: null });
        URL.revokeObjectURL(localUrl);
      } else {
        const newClip: MediaClip = {
          id: clipId,
          trackId,
          type: 'image',
          file,
          fileUrl: localUrl,
          startAt: playhead,
          duration: 3,
          mediaStart: 0,
          speed: 1,
          volume: 1,
          muted: true,
          transform: { scale: 1, rotation: 0, x: 0, y: 0 },
        };
        addClip(trackId, newClip);
        toast.success(t('studio.media.image_added'));

        const remoteUrl = await uploadAndResolveUrl(file);
        updateClip(clipId, { fileUrl: remoteUrl, file: null });
        URL.revokeObjectURL(localUrl);
      }
    } catch {
      toast.error(t('studio.media.upload_error'));
    }
  };

  const handleAddAudioFile = async (file: File) => {
    if (!project) return;
    let trackId = project.tracks.find((tr) => tr.type === 'audio')?.id;
    if (!trackId) trackId = project.tracks[0].id;

    const localUrl = URL.createObjectURL(file);
    const clipId = generateId();

    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const audioEl = document.createElement('audio');
        audioEl.src = localUrl;
        audioEl.onloadedmetadata = () => resolve(audioEl.duration);
        audioEl.onerror = () => reject(new Error('metadata'));
      });

      const newClip: MediaClip = {
        id: clipId,
        trackId: trackId as string,
        type: 'audio',
        file,
        fileUrl: localUrl,
        startAt: playhead,
        duration,
        mediaStart: 0,
        speed: 1,
        volume: 1,
        muted: false,
        transform: { scale: 1, rotation: 0, x: 0, y: 0 },
      };
      addClip(trackId as string, newClip);
      toast.success(t('studio.audio.added'));

      const remoteUrl = await uploadAndResolveUrl(file);
      updateClip(clipId, { fileUrl: remoteUrl, file: null });
      URL.revokeObjectURL(localUrl);
    } catch {
      toast.error(t('studio.media.upload_error'));
    }
  };

  const openExportModal = () => {
    setExportedBlob(null);
    setExportProgress(0);
    setShowExportModal(true);
  };

  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const handleStartExport = async (preset: FfmpegEncodePreset) => {
    if (!project) return;
    exportAbortRef.current?.abort();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    try {
      setIsExporting(true);
      setExportProgress(0);
      const exportedFile = await exportStudioProject(project, {
        preset,
        signal: controller.signal,
        onProgress: (progress) => setExportProgress(progress),
      });
      setExportedBlob(exportedFile);
    } catch (err) {
      if (
        err instanceof StudioExportError &&
        err.code === 'studio.export_errors.cancelled'
      ) {
        toast(t('studio.export_errors.cancelled'));
        setShowExportModal(false);
      } else if (err instanceof StudioExportError) {
        toast.error(t(err.code));
      } else {
        toast.error(t('studio.export_error'));
      }
    } finally {
      setIsExporting(false);
      exportAbortRef.current = null;
    }
  };

  const handleDownload = () => {
    if (!exportedBlob) return;
    const url = URL.createObjectURL(exportedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CircleSfera_Studio_Export.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportedBlob(null);
    setShowExportModal(false);
  };

  const handlePublish = async (scheduledAt: string) => {
    if (!exportedBlob) return;
    const { useUIStore } = await import('../stores/uiStore');
    const file = new File([exportedBlob], 'export.mp4', { type: 'video/mp4' });
    useUIStore.getState().setEditedMediaForPost({
      file,
      scheduledAt: scheduledAt || undefined,
    });
    navigate('/create?mode=frame');
  };

  const handleAddTrack = (type: Track['type']) => {
    const track: Track = {
      id: generateId(),
      type,
      name: t(`studio.tracks.${type}`),
      clips: [],
      muted: false,
      hidden: false,
      locked: false,
    };
    addTrack(track);
    toast.success(
      t('studio.tracks.added', { type: t(`studio.tracks.${type}`) }),
    );
  };

  // Ensure cloud draft exists once media is uploaded (for captions / autosave)
  useEffect(() => {
    if (!project) return;
    const { cloudProjectId } = useStudioStore.getState();
    if (cloudProjectId) return;
    if (getPrimaryMediaUrl(project)) {
      void saveNow();
    }
  }, [project, saveNow]);

  if (!hydrated || !project) {
    return (
      <div className="relative flex flex-col h-full bg-surface-base text-white items-center justify-center">
        <SEO title={t('studio.seo_title', 'Studio | CircleSfera')} />
        <p className="text-sm text-white/50">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-surface-base text-white overflow-hidden font-sans select-none">
      <SEO title={t('studio.seo_title', 'Studio | CircleSfera')} />

      <ExportModal
        isOpen={showExportModal}
        isExporting={isExporting}
        exportProgress={exportProgress}
        exportedBlob={exportedBlob}
        projectDuration={project.duration}
        onClose={() => {
          if (!isExporting) {
            setShowExportModal(false);
            setExportedBlob(null);
          }
        }}
        onStartExport={(preset) => void handleStartExport(preset)}
        onCancelExport={handleCancelExport}
        onPublish={(scheduledAt) => void handlePublish(scheduledAt)}
        onDownload={handleDownload}
      />

      {showDraftsModal && (
        <DraftsModal onClose={() => setShowDraftsModal(false)} />
      )}

      <StudioTopbar
        onOpenDrafts={() => setShowDraftsModal(true)}
        onExport={openExportModal}
        isExporting={isExporting || isUploading}
        onSave={() => void saveNow()}
      />

      {/* Preview */}
      <div className="relative h-[40vh] shrink-0 md:flex-1 md:min-h-0 flex flex-col bg-surface-elevated border-b border-white/10">
        <div className="flex-1 relative overflow-hidden flex items-center justify-center">
          <StudioPlayer />
        </div>
        <StudioPlaybackControls />
      </div>

      {/* Timeline strip */}
      <div className="flex-1 min-h-0 md:h-[35vh] md:max-h-[40vh] md:flex-none flex flex-col bg-surface-elevated relative shrink-0 border-b border-white/10">
        <div className="min-h-11 py-1 flex items-center justify-between px-2 sm:px-3 border-b border-white/10 shrink-0 gap-2">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={splitClip}
              disabled={!selectedClipId}
              className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 px-2.5 min-h-11 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 shrink-0"
              title={t('studio.split_title')}
            >
              <Scissors size={15} />
              <span className="hidden sm:inline">{t('studio.split')}</span>
            </button>
            <button
              type="button"
              onClick={() => selectedClipId && removeClip(selectedClipId)}
              disabled={!selectedClipId}
              className="flex items-center gap-1.5 text-brand-secondary hover:bg-brand-secondary/10 px-2.5 min-h-11 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 shrink-0"
              title={t('studio.delete')}
            >
              <Trash2 size={15} />
              <span className="hidden sm:inline">{t('studio.delete')}</span>
            </button>
            <span
              className="w-px h-5 bg-white/10 mx-0.5 shrink-0"
              aria-hidden
            />
            <button
              type="button"
              onClick={() => handleAddTrack('video')}
              className="flex items-center gap-1 text-white/60 hover:text-white hover:bg-white/10 px-2 min-h-11 rounded-lg text-[11px] font-semibold transition-colors shrink-0"
              aria-label={t('studio.tracks.add_video')}
            >
              <Plus size={12} />
              <Video size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleAddTrack('audio')}
              className="flex items-center gap-1 text-white/60 hover:text-white hover:bg-white/10 px-2 min-h-11 rounded-lg text-[11px] font-semibold transition-colors shrink-0"
              aria-label={t('studio.tracks.add_audio')}
            >
              <Plus size={12} />
              <Music size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleAddTrack('text')}
              className="flex items-center gap-1 text-white/60 hover:text-white hover:bg-white/10 px-2 min-h-11 rounded-lg text-[11px] font-semibold transition-colors shrink-0"
              aria-label={t('studio.tracks.add_text')}
            >
              <Plus size={12} />
              <Type size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0 bg-surface-base px-3 py-1 rounded-lg border border-white/10">
            <ZoomOut size={13} className="text-white/40" aria-hidden />
            <input
              type="range"
              min="10"
              max="200"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label={t('studio.zoom', 'Zoom')}
              className="w-16 appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/20 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1"
            />
            <ZoomIn size={13} className="text-white/40" aria-hidden />
          </div>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <Timeline />
        </div>
      </div>

      <StudioToolDock />

      <StudioToolSheet
        onAddMediaFile={(f) => void handleAddMediaFile(f)}
        onAddAudioFile={(f) => void handleAddAudioFile(f)}
      />
    </div>
  );
}
