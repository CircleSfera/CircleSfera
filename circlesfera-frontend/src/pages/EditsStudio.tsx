import {
  Layers,
  Scissors,
  SlidersHorizontal,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import PropertiesPanel from '../components/studio/layout/PropertiesPanel';
import StudioPlaybackControls from '../components/studio/layout/StudioPlaybackControls';
import StudioSidebar from '../components/studio/layout/StudioSidebar';
import StudioTopbar from '../components/studio/layout/StudioTopbar';
import DraftsModal from '../components/studio/modals/DraftsModal';
import ExportModal from '../components/studio/modals/ExportModal';
import StudioPlayer from '../components/studio/StudioPlayer';
import Timeline from '../components/studio/Timeline';
import { useStudioStore } from '../stores/studioStore';
import type { MediaClip, StudioProject } from '../types/studio';
import { exportStudioProject } from '../utils/ffmpegExport';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);

export default function Studio() {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
    togglePlayback,
    undo,
    redo,
  } = useStudioStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<'tools' | 'player' | 'properties'>(
    'player',
  );

  const selectedClip = project?.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId);

  // Initialize a blank project if none exists
  useEffect(() => {
    if (!project) {
      const newProject: StudioProject = {
        id: generateId(),
        name: t('studio.default_project_name') || 'Mi Vídeo Studio',
        duration: 10,
        fps: 30,
        aspectRatio: '9:16',
        resolution: { width: 1080, height: 1920 },
        tracks: [
          {
            id: generateId(),
            type: 'video',
            name: 'Pista de Vídeo',
            clips: [],
            muted: false,
            hidden: false,
            locked: false,
          },
          {
            id: generateId(),
            type: 'text',
            name: 'Pista de Texto',
            clips: [],
            muted: false,
            hidden: false,
            locked: false,
          },
          {
            id: generateId(),
            type: 'audio',
            name: 'Pista de Audio',
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

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Space -> Toggle Playback
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      }
      // Cmd+Z / Ctrl+Z -> Undo
      else if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
        undo();
      }
      // Cmd+Shift+Z / Ctrl+Shift+Z -> Redo
      else if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
        redo();
      }
      // Delete / Backspace -> Remove selected clip
      else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedClipId
      ) {
        e.preventDefault();
        removeClip(selectedClipId);
      }
      // S -> Split Clip
      else if (e.key.toLowerCase() === 's' && selectedClipId) {
        e.preventDefault();
        splitClip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback, undo, redo, selectedClipId, removeClip, splitClip]);

  const handleAddMediaFile = (file: File) => {
    if (!project) return;
    const isVideo = file.type.startsWith('video');
    const trackId =
      project.tracks.find((t) => t.type === 'video')?.id ||
      project.tracks[0].id;

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
        toast.success('Vídeo añadido al timeline');
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
      toast.success('Imagen añadida al timeline');
    }
  };

  const handleAddAudioFile = (file: File) => {
    if (!project) return;
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
      toast.success('Pista de audio añadida');
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
      toast.error(t('studio.export_error') || 'Error al exportar');
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
    <div className="flex flex-col h-full bg-[#070709] text-white overflow-hidden font-sans p-2 lg:p-3 gap-2 select-none">
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

      {/* Main Studio Dock Workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 lg:grid-rows-[1fr_auto] overflow-hidden gap-2">
        {/* Left Sidebar (Desktop Sidebar / Mobile Tab View) */}
        <div
          className={`lg:col-span-3 xl:col-span-3 lg:row-span-1 h-full overflow-hidden ${
            mobileTab === 'tools' ? 'block' : 'hidden lg:block'
          }`}
        >
          <StudioSidebar
            onAddMediaFile={handleAddMediaFile}
            onAddAudioFile={handleAddAudioFile}
          />
        </div>

        {/* Center Canvas & Player Workspace */}
        <div
          className={`relative flex-1 lg:col-span-6 xl:col-span-6 flex flex-col bg-[#0e0e12] border border-white/10 rounded-xl lg:rounded-2xl lg:row-span-1 min-h-[35vh] lg:min-h-0 overflow-hidden shadow-2xl ${
            mobileTab === 'player' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            <StudioPlayer />
          </div>
          <StudioPlaybackControls />
        </div>

        {/* Right Properties Panel Workspace */}
        <div
          className={`lg:col-span-3 xl:col-span-3 lg:row-span-1 h-full overflow-hidden ${
            mobileTab === 'properties' || selectedClip
              ? 'block'
              : 'hidden lg:block'
          }`}
        >
          {selectedClip ? (
            <PropertiesPanel />
          ) : (
            <div className="hidden lg:flex flex-1 h-full border border-white/10 rounded-2xl bg-[#121216]/95 items-center justify-center text-center p-6 text-white/30 text-xs font-semibold">
              Selecciona un elemento del lienzo o timeline para editar sus
              propiedades
            </div>
          )}
        </div>

        {/* Bottom Timeline Workspace */}
        <div className="h-[32vh] lg:h-auto lg:col-span-12 lg:row-span-1 flex flex-col bg-[#0e0e12] relative z-10 shadow-2xl border border-white/10 shrink-0 lg:min-h-64 lg:max-h-[38vh] rounded-xl lg:rounded-2xl overflow-hidden">
          {/* Main Toolbar */}
          <div className="h-11 bg-[#121216]/80 backdrop-blur-md flex items-center justify-between px-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={splitClip}
                disabled={!selectedClipId}
                className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Dividir clip en el cursor (S)"
              >
                <Scissors size={15} />
                <span>Dividir (S)</span>
              </button>

              <button
                type="button"
                onClick={() => selectedClipId && removeClip(selectedClipId)}
                disabled={!selectedClipId}
                className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Eliminar clip (Supr)"
              >
                <Trash2 size={15} />
                <span>Borrar</span>
              </button>
            </div>

            {/* Mobile View Switcher */}
            <div className="flex lg:hidden items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setMobileTab('tools')}
                className={`p-1 rounded text-xs font-bold ${
                  mobileTab === 'tools'
                    ? 'bg-brand-primary text-white'
                    : 'text-white/40'
                }`}
              >
                <Layers size={14} />
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('player')}
                className={`p-1 rounded text-xs font-bold ${
                  mobileTab === 'player'
                    ? 'bg-brand-primary text-white'
                    : 'text-white/40'
                }`}
              >
                Player
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('properties')}
                className={`p-1 rounded text-xs font-bold ${
                  mobileTab === 'properties'
                    ? 'bg-brand-primary text-white'
                    : 'text-white/40'
                }`}
              >
                <SlidersHorizontal size={14} />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-2 shrink-0 bg-[#0a0a0c] px-3 py-1 rounded-lg border border-white/10">
              <ZoomOut size={13} className="text-white/40" />
              <input
                type="range"
                min="10"
                max="200"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-20 appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/20 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1"
              />
              <ZoomIn size={13} className="text-white/40" />
            </div>
          </div>

          {/* Timeline Container */}
          <div className="flex-1 overflow-hidden relative">
            <Timeline />
          </div>
        </div>
      </div>
    </div>
  );
}
