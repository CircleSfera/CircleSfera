import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import EditorPanel from '../components/studio/editor/EditorPanel';
import EditorTimeline from '../components/studio/editor/EditorTimeline';
import EditorToolbar from '../components/studio/editor/EditorToolbar';
import EditorTopbar from '../components/studio/editor/EditorTopbar';
import EditorTransport from '../components/studio/editor/EditorTransport';
import ExportModal from '../components/studio/modals/ExportModal';
import type { VoiceRecording } from '../components/studio/panels/VoicePanel';
import StudioPlayer from '../components/studio/StudioPlayer';
import { useStudioAutosave } from '../hooks/useStudioAutosave';
import { useWideScreen } from '../hooks/useWideScreen';
import { uploadApi } from '../services/upload.service';
import { useStudioStore } from '../stores/studioStore';
import type { Audio } from '../types';
import type { MediaClip, Track } from '../types/studio';
import { exportStudioProject } from '../utils/ffmpegExport';
import { readMediaDuration } from '../utils/mediaDuration';
import { librarySongOf } from '../utils/studioAudio';
import {
  type FfmpegEncodePreset,
  StudioExportError,
} from '../utils/studioExportHelpers';
import { loadLocalStudioDraft } from '../utils/studioLocalDraft';
import { getPrimaryMediaUrl, projectContentEnd } from '../utils/studioProject';
import { newBlankProject } from '../utils/studioProjects';
import {
  emptyTrack,
  locateClip,
  mainTrackEnd,
  mainTrackOf,
  newStudioId,
  PHOTO_CLIP_SEC,
} from '../utils/studioTimeline';

const STUDIO_KEYS_IGNORED_IN = ['INPUT', 'TEXTAREA', 'SELECT'];

/** The editor of one project of the Edits Studio. */
export default function EditsStudio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { saveNow } = useStudioAutosave();
  // The panel of a tool: beside the video on a wide screen, over the
  // timeline on a phone.
  const wide = useWideScreen();

  const project = useStudioStore((s) => s.project);
  const setProject = useStudioStore((s) => s.setProject);
  const setCloudProjectId = useStudioStore((s) => s.setCloudProjectId);
  const addClip = useStudioStore((s) => s.addClip);
  const addLayerClip = useStudioStore((s) => s.addLayerClip);
  const replaceClipMedia = useStudioStore((s) => s.replaceClipMedia);
  const duplicateSelected = useStudioStore((s) => s.duplicateSelected);
  const openSheet = useStudioStore((s) => s.openSheet);

  const [hydrated, setHydrated] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [showExport, setShowExport] = useState(false);
  const exportOpenRef = useRef(false);
  exportOpenRef.current = showExport;
  const exportAbortRef = useRef<AbortController | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const newTrack = (type: Track['type']) =>
    emptyTrack(type, t(`studio.tracks.${type}`));

  // The project open in the store, else the one left on this device, else
  // a new one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!useStudioStore.getState().project) {
        const local = await loadLocalStudioDraft();
        if (cancelled) return;
        if (local?.project) {
          setProject(local.project);
          if (local.cloudProjectId) setCloudProjectId(local.cloudProjectId);
        } else {
          setProject(newBlankProject(t('studio.default_project_name'), t));
        }
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setProject, setCloudProjectId, t]);

  // Leaving stops an export in progress: its result would have nowhere to go.
  useEffect(() => () => exportAbortRef.current?.abort(), []);

  // A project is kept in the cloud once it has media there.
  useEffect(() => {
    if (!project || useStudioStore.getState().cloudProjectId) return;
    if (getPrimaryMediaUrl(project)) void saveNow();
  }, [project, saveNow]);

  const upload = async (file: File): Promise<string> => {
    setUploads((n) => n + 1);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await uploadApi.upload(formData);
      return data.url;
    } finally {
      setUploads((n) => n - 1);
    }
  };

  // The clip shows the file from this device at once; the uploaded copy
  // takes its place when it is ready.
  const swapToUploaded = async (file: File, localUrl: string) => {
    const remoteUrl = await upload(file);
    // Every clip showing this file takes the uploaded copy, a copy of the
    // clip made meanwhile included, before the file on this device goes.
    useStudioStore.getState().replaceMediaUrl(localUrl, remoteUrl);
    URL.revokeObjectURL(localUrl);
  };

  // Media goes at the end of the main track, in the order chosen.
  const addMediaFiles = async (files: File[]) => {
    for (const file of files) {
      const state = useStudioStore.getState();
      const current = state.project;
      if (!current) return;
      const main = mainTrackOf(current);
      if (!main) return;
      const isVideo = file.type.startsWith('video');
      const localUrl = URL.createObjectURL(file);
      const id = newStudioId();
      try {
        const sourceDuration = isVideo
          ? await readMediaDuration(localUrl, 'video')
          : undefined;
        const clip: MediaClip = {
          id,
          trackId: main.id,
          type: isVideo ? 'video' : 'image',
          file,
          fileUrl: localUrl,
          startAt: mainTrackEnd(useStudioStore.getState().project ?? current),
          duration: sourceDuration ?? PHOTO_CLIP_SEC,
          sourceDuration,
          mediaStart: 0,
          speed: 1,
          volume: 1,
          muted: !isVideo,
          transform: { scale: 1, rotation: 0, x: 0, y: 0 },
        };
        addClip(main.id, clip);
        await swapToUploaded(file, localUrl);
      } catch {
        toast.error(t('studio.media.upload_error'));
      }
    }
  };

  // A sound starts at the playhead, on the first sound layer free there.
  const addAudioFile = async (file: File) => {
    const localUrl = URL.createObjectURL(file);
    const id = newStudioId();
    try {
      const sourceDuration = await readMediaDuration(localUrl, 'audio');
      const clip: MediaClip = {
        id,
        trackId: '',
        type: 'audio',
        file,
        label: file.name.replace(/\.[^.]+$/, ''),
        fileUrl: localUrl,
        startAt: useStudioStore.getState().playhead,
        duration: sourceDuration,
        sourceDuration,
        mediaStart: 0,
        speed: 1,
        volume: 1,
        muted: false,
        transform: { scale: 1, rotation: 0, x: 0, y: 0 },
      };
      addLayerClip('audio', clip, () => newTrack('audio'));
      useStudioStore.getState().setOpenSheet(null);
      toast.success(t('studio.audio.added'));
      await swapToUploaded(file, localUrl);
    } catch {
      toast.error(t('studio.media.upload_error'));
    }
  };

  // A song of the library starts at the playhead, as long as it is or
  // until the video ends, on the first sound layer free there.
  const addLibraryAudio = (audio: Audio) => {
    const state = useStudioStore.getState();
    const current = state.project;
    if (!current) return;
    const end = projectContentEnd(current);
    const room = end > state.playhead ? end - state.playhead : audio.duration;
    const clip: MediaClip = {
      id: newStudioId(),
      trackId: '',
      type: 'audio',
      file: null,
      fileUrl: audio.url,
      startAt: state.playhead,
      duration: Math.min(audio.duration, room),
      sourceDuration: audio.duration,
      audioId: audio.id,
      label: audio.title,
      mediaStart: 0,
      speed: 1,
      volume: 1,
      muted: false,
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    };
    addLayerClip('audio', clip, () => newTrack('audio'));
    useStudioStore.getState().setOpenSheet(null);
    toast.success(t('studio.audio.added_song', { title: audio.title }));
  };

  // A recorded voice goes where it was recorded, on a voice layer, once
  // uploaded.
  const addRecording = async ({ blob, startAt, duration }: VoiceRecording) => {
    const type = blob.type.split(';')[0] || 'audio/webm';
    const ext = type.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([blob], `voice.${ext}`, { type });
    try {
      const url = await upload(file);
      const clip: MediaClip = {
        id: newStudioId(),
        trackId: '',
        type: 'audio',
        file: null,
        fileUrl: url,
        startAt,
        duration,
        sourceDuration: duration,
        label: t('studio.tracks.voice'),
        mediaStart: 0,
        speed: 1,
        volume: 1,
        muted: false,
        transform: { scale: 1, rotation: 0, x: 0, y: 0 },
      };
      addLayerClip('voice', clip, () => newTrack('voice'));
      toast.success(t('studio.voice.added'));
    } catch {
      toast.error(t('studio.media.upload_error'));
    }
  };

  const replaceSelected = async (file: File) => {
    const state = useStudioStore.getState();
    const clipId = state.selectedClipId;
    const found =
      state.project && clipId ? locateClip(state.project, clipId) : null;
    if (!found || found.clip.type === 'text' || !clipId) return;
    const kind = file.type.startsWith('video')
      ? 'video'
      : file.type.startsWith('audio')
        ? 'audio'
        : 'image';
    // A sound is replaced by a sound, a picture by a picture or a video.
    if ((found.clip.type === 'audio') !== (kind === 'audio')) {
      toast.error(t('studio.replace.wrong_kind'));
      return;
    }
    const localUrl = URL.createObjectURL(file);
    try {
      const sourceDuration =
        kind === 'image' ? null : await readMediaDuration(localUrl, kind);
      replaceClipMedia(clipId, {
        type: kind,
        file,
        fileUrl: localUrl,
        sourceDuration,
      });
      await swapToUploaded(file, localUrl);
    } catch {
      toast.error(t('studio.media.upload_error'));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        STUDIO_KEYS_IGNORED_IN.includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      // With the export open, the keys belong to it.
      if (exportOpenRef.current) return;
      // Space on a button presses that button.
      if (e.code === 'Space' && target.tagName === 'BUTTON') return;
      const store = useStudioStore.getState();
      const frame = 1 / (store.project?.fps || 30);
      const end = store.project?.duration ?? 0;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (e.code === 'Space' || key === 'k') {
        e.preventDefault();
        store.togglePlayback();
      } else if (e.key === 'ArrowLeft' || key === 'j') {
        e.preventDefault();
        store.setPlaying(false);
        store.setPlayhead(
          Math.max(0, store.playhead - (key === 'j' ? 1 : frame)),
        );
      } else if (e.key === 'ArrowRight' || key === 'l') {
        e.preventDefault();
        store.setPlaying(false);
        store.setPlayhead(
          Math.min(end, store.playhead + (key === 'l' ? 1 : frame)),
        );
      } else if (e.key === '=' || e.key === '+') {
        store.setZoom(store.zoom + 10);
      } else if (e.key === '-') {
        store.setZoom(store.zoom - 10);
      } else if (e.key === 'Escape') {
        if (store.openSheet) store.setOpenSheet(null);
        else store.selectClip(null);
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        store.selectedClipId
      ) {
        e.preventDefault();
        store.removeClip(store.selectedClipId);
      } else if (key === 's' && store.selectedClipId) {
        e.preventDefault();
        store.splitClip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startExport = async (preset: FfmpegEncodePreset) => {
    const current = useStudioStore.getState().project;
    if (!current) return;
    exportAbortRef.current?.abort();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    try {
      setIsExporting(true);
      setExportProgress(0);
      setExportedBlob(
        await exportStudioProject(current, {
          preset,
          signal: controller.signal,
          onProgress: setExportProgress,
        }),
      );
    } catch (err) {
      if (
        err instanceof StudioExportError &&
        err.code === 'studio.export_errors.cancelled'
      ) {
        toast(t('studio.export_errors.cancelled'));
        setShowExport(false);
      } else {
        toast.error(
          t(
            err instanceof StudioExportError ? err.code : 'studio.export_error',
          ),
        );
      }
    } finally {
      setIsExporting(false);
      exportAbortRef.current = null;
    }
  };

  const download = () => {
    if (!exportedBlob) return;
    const url = URL.createObjectURL(exportedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project?.name || 'CircleSfera').replace(/[^\w-]+/g, '_')}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExportedBlob(null);
    setShowExport(false);
  };

  const publish = async (scheduledAt: string) => {
    if (!exportedBlob) return;
    const { useUIStore } = await import('../stores/uiStore');
    useUIStore.getState().setEditedMediaForPost({
      file: new File([exportedBlob], 'export.mp4', { type: 'video/mp4' }),
      scheduledAt: scheduledAt || undefined,
      songInVideo: project ? (librarySongOf(project) ?? undefined) : undefined,
    });
    navigate('/create?mode=frame');
  };

  const close = async () => {
    useStudioStore.getState().setPlaying(false);
    await saveNow();
    navigate('/edits');
  };

  const panelActions = {
    onAddAudioFile: (f: File) => void addAudioFile(f),
    onAddLibraryAudio: addLibraryAudio,
    onRecorded: (r: VoiceRecording) => void addRecording(r),
  };

  if (!hydrated || !project) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base">
        <SEO title={t('studio.seo_title')} />
        <p className="text-sm text-white/50">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-surface-base text-white select-none">
      <SEO title={t('studio.seo_title')} />

      <EditorTopbar
        onClose={() => void close()}
        onExport={() => {
          setExportedBlob(null);
          setExportProgress(0);
          setShowExport(true);
        }}
        busy={isExporting || uploads > 0 || projectContentEnd(project) === 0}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pt-3">
            <StudioPlayer />
          </div>
          <EditorTransport />
        </div>
        {wide && (
          <aside
            className="w-90 shrink-0 border-l border-white/10 bg-surface-elevated"
            aria-label={t('studio.panel_label')}
          >
            <EditorPanel variant="side" {...panelActions} />
          </aside>
        )}
      </div>

      <div className="relative h-[30vh] min-h-44 max-h-72 shrink-0 border-t border-white/10 bg-surface-base">
        <EditorTimeline onAddMedia={() => mediaInputRef.current?.click()} />
        {!wide && openSheet && (
          <EditorPanel variant="sheet" {...panelActions} />
        )}
      </div>

      <EditorToolbar
        onAddMedia={() => mediaInputRef.current?.click()}
        onReplace={() => replaceInputRef.current?.click()}
        onDuplicate={() => duplicateSelected(newTrack)}
        onDetachSound={() => {
          const id = useStudioStore.getState().selectedClipId;
          if (id)
            useStudioStore.getState().detachSound(id, () => newTrack('audio'));
        }}
      />

      <input
        ref={mediaInputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        className="hidden"
        data-testid="studio-media-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void addMediaFiles(files);
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="video/*,image/*,audio/*"
        className="hidden"
        data-testid="studio-replace-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void replaceSelected(file);
        }}
      />

      <ExportModal
        isOpen={showExport}
        isExporting={isExporting}
        exportProgress={exportProgress}
        exportedBlob={exportedBlob}
        projectDuration={project.duration}
        onClose={() => {
          if (!isExporting) {
            setShowExport(false);
            setExportedBlob(null);
          }
        }}
        onStartExport={(preset) => void startExport(preset)}
        onCancelExport={() => exportAbortRef.current?.abort()}
        onPublish={(scheduledAt) => void publish(scheduledAt)}
        onDownload={download}
      />
    </div>
  );
}
