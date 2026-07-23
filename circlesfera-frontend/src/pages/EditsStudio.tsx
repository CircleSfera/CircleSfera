import {
  Music,
  Plus,
  Scissors,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import PropertiesPanel from '../components/studio/layout/PropertiesPanel';
import StudioPlaybackControls from '../components/studio/layout/StudioPlaybackControls';
import StudioTopbar from '../components/studio/layout/StudioTopbar';
import DraftsModal from '../components/studio/modals/DraftsModal';
import ExportModal from '../components/studio/modals/ExportModal';
import StudioPlayer from '../components/studio/StudioPlayer';
import Timeline from '../components/studio/Timeline';
import { useStudioStore } from '../stores/studioStore';
import type { MediaClip, StudioProject, TextClip } from '../types/studio';
import { exportStudioProject } from '../utils/ffmpegExport';

const generateId = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);
};

export default function Studio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const {
    project,
    setProject,
    addClip,
    splitClip,
    removeClip,
    selectedClipId,
    zoom,
    setZoom,
    playhead,
  } = useStudioStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [showDraftsModal, setShowDraftsModal] = useState(false);

  const selectedClip = project?.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId);

  // Initialize a blank project if none exists
  useEffect(() => {
    if (!project) {
      const newProject: StudioProject = {
        id: generateId(),
        name: t('studio.default_project_name'),
        duration: 10,
        fps: 30,
        resolution: { width: 1080, height: 1920 },
        tracks: [
          {
            id: generateId(),
            type: 'video',
            name: t('studio.default_track_name'),
            clips: [],
            muted: false,
            hidden: false,
            locked: false,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setProject(newProject);
    }
  }, [project, setProject, t]);

  const handleAddMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !project) return;

    const file = e.target.files[0];
    const isVideo = file.type.startsWith('video');
    const trackId = project.tracks.find((t) => t.type === 'video')?.id;

    if (!trackId) return;

    const fileUrl = URL.createObjectURL(file);

    if (isVideo) {
      const videoEl = document.createElement('video');
      videoEl.src = fileUrl;
      videoEl.onloadedmetadata = () => {
        const newClip: MediaClip = {
          id: generateId(),
          trackId,
          type: 'video',
          file,
          fileUrl,
          startAt: playhead,
          duration: videoEl.duration,
          mediaStart: 0,
          speed: 1,
          volume: 1,
          muted: false,
          transform: { scale: 1, rotation: 0, x: 0, y: 0 },
        };
        addClip(trackId, newClip);
      };
    } else {
      const newClip: MediaClip = {
        id: generateId(),
        trackId,
        type: 'image',
        file,
        fileUrl,
        startAt: playhead,
        duration: 3,
        mediaStart: 0,
        speed: 1,
        volume: 1,
        muted: true,
        transform: { scale: 1, rotation: 0, x: 0, y: 0 },
      };
      addClip(trackId, newClip);
    }
  };

  const handleAddText = () => {
    if (!project) return;
    let trackId = project.tracks.find((t) => t.type === 'text')?.id;
    if (!trackId) trackId = project.tracks[0].id;

    const newClip: TextClip = {
      id: generateId(),
      trackId,
      type: 'text',
      startAt: playhead,
      duration: 3,
      content: t('studio.default_text'),
      style: {
        color: '#ffffff',
        fontSize: 40,
        fontFamily: 'Arial',
        backgroundColor: 'transparent',
        textAlign: 'center',
      },
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    };

    addClip(trackId, newClip);
  };

  const handleAddAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !project) return;

    const file = e.target.files[0];
    let trackId = project.tracks.find((t) => t.type === 'audio')?.id;
    if (!trackId) trackId = project.tracks[0].id;

    const fileUrl = URL.createObjectURL(file);
    const audioEl = document.createElement('audio');
    audioEl.src = fileUrl;
    audioEl.onloadedmetadata = () => {
      const newClip: MediaClip = {
        id: generateId(),
        trackId: trackId as string,
        type: 'audio',
        file,
        fileUrl,
        startAt: playhead,
        duration: audioEl.duration,
        mediaStart: 0,
        speed: 1,
        volume: 1,
        muted: false,
        transform: { scale: 1, rotation: 0, x: 0, y: 0 },
      };
      addClip(trackId as string, newClip);
    };
  };

  const handleExport = async () => {
    if (!project) return;
    try {
      setIsExporting(true);
      setExportProgress(0);
      const exportedFile = await exportStudioProject(project, (progress) => {
        setExportProgress(progress);
      });
      setExportedBlob(exportedFile);
    } catch (error) {
      console.error('Export failed', error);
      toast.error(t('studio.export_error'));
    } finally {
      setIsExporting(false);
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
  };

  const handlePublish = async () => {
    if (!exportedBlob) return;
    const { useUIStore } = await import('../stores/uiStore');
    const file = new File([exportedBlob], 'export.mp4', { type: 'video/mp4' });
    useUIStore.getState().setEditedMediaForPost(file);
    navigate('/create?mode=frame');
  };

  return (
    <div className="flex flex-col h-full bg-[url('/noise.png')] bg-repeat bg-[#0a0a0c] text-white overflow-hidden font-sans p-2 lg:p-4 gap-2 lg:gap-4">
      <SEO title="Studio | CircleSfera" />

      {/* Modals */}
      <ExportModal
        isExporting={isExporting}
        exportProgress={exportProgress}
        exportedBlob={exportedBlob}
        onClose={() => setExportedBlob(null)}
        onPublish={handlePublish}
        onDownload={handleDownload}
      />

      {showDraftsModal && (
        <DraftsModal onClose={() => setShowDraftsModal(false)} />
      )}

      {/* Top Navbar */}
      <StudioTopbar
        onOpenDrafts={() => setShowDraftsModal(true)}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {/* Layout Grid: Mobile First (Stack) -> Desktop Pro (Grid) */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 lg:grid-rows-[1fr_auto] overflow-hidden gap-2 lg:gap-4">
        {/* PLAYER AREA */}
        <div className="relative flex-1 lg:col-span-8 xl:col-span-9 flex flex-col bg-[#0e0e12] border border-white/5 rounded-xl lg:rounded-2xl lg:row-span-1 min-h-[40vh] lg:min-h-0 overflow-hidden shadow-2xl">
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            <StudioPlayer />
          </div>
          <StudioPlaybackControls />
        </div>

        {/* PROPERTIES PANEL AREA */}
        <div
          className={`lg:col-span-4 xl:col-span-3 lg:row-span-1 bg-[#121216] overflow-hidden flex flex-col z-30 transition-all ${selectedClip ? 'absolute inset-x-0 bottom-[35vh] lg:static lg:h-full border border-white/5 rounded-t-xl lg:rounded-2xl shadow-2xl' : 'hidden lg:flex border border-white/5 rounded-2xl shadow-2xl'}`}
        >
          {selectedClip ? (
            <PropertiesPanel />
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center text-center p-8 text-white/30">
              {t('studio.select_clip_hint')}
            </div>
          )}
        </div>

        {/* TIMELINE AREA */}
        <div className="h-[35vh] lg:h-auto lg:col-span-12 lg:row-span-1 flex flex-col bg-[#0e0e12] relative z-10 shadow-2xl border border-white/5 shrink-0 lg:min-h-[300px] lg:max-h-[40vh] rounded-xl lg:rounded-2xl overflow-hidden">
          {/* Main Toolbar */}
          <div className="h-12 bg-[#121216]/50 flex items-center justify-between px-2 sm:px-4 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-brand-primary text-white hover:bg-brand-primary/90 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={16} />
                <span className="text-xs font-semibold">
                  {t('studio.media')}
                </span>
              </button>
              <button
                type="button"
                onClick={handleAddText}
                className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Type size={16} />
                <span className="text-xs font-medium">{t('studio.text')}</span>
              </button>
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Music size={16} />
                <span className="text-xs font-medium">{t('studio.audio')}</span>
              </button>

              <div className="w-px h-5 bg-white/10 mx-1 sm:mx-2 shrink-0" />

              <button
                type="button"
                onClick={splitClip}
                disabled={!selectedClipId}
                className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title={t('studio.split_title')}
              >
                <Scissors size={16} />
                <span className="text-xs font-medium hidden sm:inline">
                  {t('studio.split')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => selectedClipId && removeClip(selectedClipId)}
                disabled={!selectedClipId}
                className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 size={16} />
                <span className="text-xs font-medium hidden sm:inline">
                  {t('studio.delete')}
                </span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-2 pl-4 shrink-0 bg-[#0a0a0c] px-3 py-1 rounded-lg border border-white/5">
              <ZoomOut size={14} className="text-white/40" />
              <input
                type="range"
                min="10"
                max="200"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-20 appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/20 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/20 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
              />
              <ZoomIn size={14} className="text-white/40" />
            </div>
          </div>

          {/* Timeline Container */}
          <div className="flex-1 overflow-hidden relative">
            <Timeline />
          </div>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAddMedia}
        accept="video/*,image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={audioInputRef}
        onChange={handleAddAudio}
        accept="audio/*"
        className="hidden"
      />
    </div>
  );
}
