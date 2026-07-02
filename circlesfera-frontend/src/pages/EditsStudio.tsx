import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cloud,
  Download,
  FolderOpen,
  Maximize,
  Music,
  Pause,
  Play,
  Plus,
  Scissors,
  Settings2,
  SkipBack,
  SkipForward,
  Trash2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import StudioPlayer from '../components/studio/StudioPlayer';
import Timeline from '../components/studio/Timeline';
import { Button } from '../components/ui';
import { editsService } from '../services/edits.service';
import { useStudioStore } from '../stores/studioStore';
import type { MediaClip, StudioProject, TextClip } from '../types/studio';
import { exportStudioProject } from '../utils/ffmpegExport';

const generateId = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);
};

export default function Studio() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const {
    project,
    setProject,
    cloudProjectId,
    setCloudProjectId,
    isPlaying,
    togglePlayback,
    addClip,
    splitClip,
    removeClip,
    selectedClipId,
    selectClip,
    updateClip,
    playhead,
    setPlayhead,
    zoom,
    setZoom,
  } = useStudioStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: drafts } = useQuery({
    queryKey: ['studioDrafts'],
    queryFn: () => editsService.getProjects(),
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!project) return;
      if (cloudProjectId) {
        return editsService.updateProjectState(cloudProjectId, {
          version: 3,
          studio: project,
        });
      } else {
        return editsService.createProject(
          'studio',
          'video',
          { version: 3, studio: project },
          project.name,
        );
      }
    },
    onSuccess: (data) => {
      if (data?.id) {
        setCloudProjectId(data.id);
        queryClient.invalidateQueries({ queryKey: ['studioDrafts'] });
        alert('Borrador guardado en la nube exitosamente');
      }
    },
  });

  const selectedClip = project?.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId);

  // Initialize a blank project if none exists
  useEffect(() => {
    if (!project) {
      const newProject: StudioProject = {
        id: generateId(),
        name: 'Nuevo Proyecto',
        duration: 10, // Initial 10 seconds empty
        fps: 30,
        resolution: { width: 1080, height: 1920 },
        tracks: [
          {
            id: generateId(),
            type: 'video',
            name: 'Pista Principal',
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
  }, [project, setProject]);

  const handleAddMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !project) return;

    const file = e.target.files[0];
    const isVideo = file.type.startsWith('video');
    const trackId = project.tracks.find((t) => t.type === 'video')?.id;

    if (!trackId) return;

    const fileUrl = URL.createObjectURL(file);

    // Determine duration. For video, we'd need to load metadata. For image, default to 3s.
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
          startAt: 0, // Should find the end of the track
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
        startAt: 0,
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

    // Find or create a text track
    let trackId = project.tracks.find((t) => t.type === 'text')?.id;
    if (!trackId) {
      // If we don't have a track creator yet, let's just use the first track for now,
      // or ideally we add a dedicated text track. For now, use the first track.
      trackId = project.tracks[0].id;
    }

    const newClip: TextClip = {
      id: generateId(),
      trackId,
      type: 'text',
      startAt: useStudioStore.getState().playhead,
      duration: 3,
      content: 'Nuevo Texto',
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
    if (!trackId) {
      trackId = project.tracks[0].id; // Fallback to first track
    }

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
        startAt: useStudioStore.getState().playhead,
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
      alert('Error exportando el video. Inténtalo de nuevo.');
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
    setExportedBlob(null); // Reset
  };

  const handlePublish = async () => {
    if (!exportedBlob) return;
    const { useUIStore } = await import('../stores/uiStore');
    const file = new File([exportedBlob], 'export.mp4', { type: 'video/mp4' });
    useUIStore.getState().setEditedMediaForPost(file);
    navigate('/create?mode=frame');
  };

  const formatTimecode = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    const frames = Math.floor((timeInSeconds % 1) * 30);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  };

  const skipFrames = (frames: number) => {
    const timeToSkip = frames / 30; // assuming 30fps
    setPlayhead(Math.max(0, playhead + timeToSkip));
  };

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0c] text-white overflow-hidden font-sans">
      <SEO title="Studio | CircleSfera" />

      {/* Exporting Overlay */}
      {isExporting && (
        <div className="absolute inset-0 z-50 modal-glass flex flex-col items-center justify-center">
          <div className="w-64 bg-zinc-900/50 rounded-full h-2 overflow-hidden border border-white/10 shadow-inner">
            <div
              className="h-full bg-brand-primary transition-all duration-300 shadow-[0_0_10px_rgba(131,58,180,0.8)]"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
          <p className="mt-4 text-white font-bold animate-pulse">
            Renderizando... {Math.round(exportProgress)}%
          </p>
        </div>
      )}

      {/* Export Success Overlay */}
      {exportedBlob && !isExporting && (
        <div className="absolute inset-0 z-50 modal-glass flex flex-col items-center justify-center animate-in">
          <div className="bg-zinc-900/80 backdrop-blur-xl p-8 rounded-2xl border border-white/10 shadow-2xl w-full max-w-sm flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-brand-primary/20 text-brand-primary rounded-full flex items-center justify-center mb-4 ring-1 ring-brand-primary/50">
              <Download size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              ¡Vídeo listo!
            </h2>
            <p className="text-white/60 mb-8 text-sm">
              Tu proyecto ha sido renderizado exitosamente.
            </p>

            <div className="flex flex-col gap-3 w-full">
              <Button
                variant="primary"
                onClick={handlePublish}
                className="w-full bg-brand-primary hover:bg-brand-primary/90 hover:scale-[1.02] transition-all"
              >
                Publicar en CircleSfera
              </Button>
              <Button
                variant="outline"
                onClick={handleDownload}
                className="w-full hover:bg-white/5"
              >
                Descargar al dispositivo
              </Button>
              <button
                type="button"
                onClick={() => setExportedBlob(null)}
                className="mt-2 text-white/40 hover:text-white/80 text-sm font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drafts Modal */}
      {showDraftsModal && (
        <div className="absolute inset-0 z-50 modal-glass flex flex-col items-center justify-center animate-in p-4">
          <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-6 border-b border-white/5 shrink-0">
              <div>
                <h2 className="text-xl font-bold">Mis Borradores</h2>
                <p className="text-sm text-white/50">
                  Proyectos guardados en la nube
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDraftsModal(false)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {!drafts || drafts.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/20">
                    <Cloud size={32} />
                  </div>
                  <p className="text-zinc-500 font-medium">
                    No tienes borradores guardados
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {drafts
                    .filter((d) => (d.state as any)?.version === 3)
                    .map((draft) => {
                      const studio = (draft.state as any)?.studio;
                      return (
                        <button
                          type="button"
                          key={draft.id}
                          onClick={() => {
                            setProject(studio);
                            setCloudProjectId(draft.id);
                            setShowDraftsModal(false);
                          }}
                          className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-xl hover:bg-white/10 hover:border-white/10 hover:scale-[1.01] transition-all text-left group"
                        >
                          <div className="w-12 h-12 bg-black/40 rounded flex flex-col items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                            <FolderOpen size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white truncate">
                              {draft.name || studio?.name || 'Proyecto'}
                            </h3>
                            <p className="text-xs text-white/50 mt-0.5">
                              Actualizado:{' '}
                              {new Date(draft.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <div className="h-14 flex items-center justify-between px-4 shrink-0 border-b border-white/5 z-10 bg-[rgba(16,16,20,0.9)] backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-linear-to-br from-brand-primary to-brand-blue flex items-center justify-center shadow-lg shadow-brand-primary/20">
              <Scissors size={12} className="text-white" />
            </div>
            <input
              type="text"
              value={project?.name || 'Nuevo Proyecto'}
              onChange={(e) =>
                project && setProject({ ...project, name: e.target.value })
              }
              className="bg-transparent border-none text-sm font-bold text-white w-24 sm:w-32 focus:w-36 sm:focus:w-48 transition-all outline-none focus:ring-1 focus:ring-brand-primary/50 rounded px-1 -ml-1 placeholder:text-white/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDraftsModal(true)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            title="Abrir borrador"
          >
            <FolderOpen size={16} />
            <span className="hidden md:inline">Abrir</span>
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={() => saveDraftMutation.mutate()}
            disabled={saveDraftMutation.isPending}
            className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Guardar en la nube"
          >
            <Cloud
              size={16}
              className={saveDraftMutation.isPending ? 'animate-bounce' : ''}
            />
            <span className="hidden md:inline">Guardar</span>
          </button>

          <Button
            variant="primary"
            onClick={handleExport}
            disabled={isExporting}
            className="ml-2 bg-white text-black hover:bg-zinc-200 h-8 px-4 rounded-full text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        </div>
      </div>

      {/* Main Area: Preview + Toolbar + Timeline */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left/Top: Preview & Controls */}
        <div className="flex-1 flex flex-col relative z-0 border-r border-white/5">
          {/* Preview Canvas */}
          <div className="flex-1 relative overflow-hidden bg-black flex flex-col">
            <StudioPlayer />

            {/* Playback Controls Area */}
            <div className="h-16 bg-[#0a0a0c] border-t border-white/5 shrink-0 flex items-center justify-between px-3 sm:px-6 z-20">
              {/* Left: Timecode */}
              <div className="w-20 sm:w-32">
                <span className="font-mono text-xs sm:text-sm text-brand-primary drop-shadow-[0_0_8px_rgba(131,58,180,0.5)] bg-brand-primary/10 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
                  {formatTimecode(playhead)}
                </span>
                <span className="font-mono text-xs text-white/30 ml-2 hidden sm:inline">
                  / {formatTimecode(project?.duration || 0)}
                </span>
              </div>

              {/* Center: Playback Buttons */}
              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setPlayhead(0)}
                  className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Ir al inicio"
                >
                  <SkipBack size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => skipFrames(-1)}
                  className="hidden sm:block p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Frame anterior"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polygon points="11 19 2 12 11 5 11 19"></polygon>
                    <polygon points="22 19 13 12 22 5 22 19"></polygon>
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={togglePlayback}
                  className="p-3 bg-white text-black hover:bg-zinc-200 hover:scale-105 rounded-full transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                >
                  {isPlaying ? (
                    <Pause size={20} className="fill-black" />
                  ) : (
                    <Play size={20} className="fill-black ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => skipFrames(1)}
                  className="hidden sm:block p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Siguiente frame"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polygon points="13 19 22 12 13 5 13 19"></polygon>
                    <polygon points="2 19 11 12 2 5 2 19"></polygon>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => project && setPlayhead(project.duration)}
                  className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Ir al final"
                >
                  <SkipForward size={18} />
                </button>
              </div>

              {/* Right: Fullscreen/Settings */}
              <div className="w-20 sm:w-32 flex justify-end gap-2">
                <button
                  type="button"
                  className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Maximize size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom/Right: Timeline Area */}
        <div className="h-[35vh] lg:h-full lg:w-[45%] flex flex-col shrink-0 bg-[#0e0e12] relative z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] lg:shadow-none">
          {/* Main Toolbar */}
          <div className="h-14 bg-[#121216] flex items-center justify-between px-4 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 px-3 py-1.5 rounded-md transition-colors"
              >
                <Plus size={16} />
                <span className="text-xs font-semibold">Media</span>
              </button>
              <button
                type="button"
                onClick={handleAddText}
                className="flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors"
              >
                <Type size={16} />
                <span className="text-xs font-medium">Texto</span>
              </button>
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors"
              >
                <Music size={16} />
                <span className="text-xs font-medium">Audio</span>
              </button>

              <div className="w-px h-6 bg-white/10 mx-2 shrink-0" />

              <button
                type="button"
                onClick={splitClip}
                disabled={!selectedClipId}
                className="flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Dividir en el playhead"
              >
                <Scissors size={16} />
                <span className="text-xs font-medium hidden sm:inline">
                  Dividir
                </span>
              </button>
              <button
                type="button"
                onClick={() => selectedClipId && removeClip(selectedClipId)}
                disabled={!selectedClipId}
                className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 px-3 py-1.5 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 size={16} />
                <span className="text-xs font-medium hidden sm:inline">
                  Borrar
                </span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-2 pl-4 shrink-0">
              <ZoomOut size={14} className="text-white/40" />
              <input
                type="range"
                min="10"
                max="200"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-20"
              />
              <ZoomIn size={14} className="text-white/40" />
            </div>
          </div>

          {/* Properties Panel (Floating bottom sheet on mobile, inline on desktop) */}
          {selectedClip && (
            <div className="lg:static absolute bottom-0 left-0 right-0 z-30 lg:z-0 bg-[#121216]/95 lg:bg-[#1a1a20] border-t lg:border-t-0 border-b border-white/10 lg:border-white/5 p-4 lg:p-3 rounded-t-2xl lg:rounded-none shadow-2xl lg:shadow-none flex flex-col lg:flex-row lg:flex-wrap gap-4 lg:gap-x-6 lg:gap-y-3 animate-in slide-in-from-bottom lg:slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between w-full border-b border-white/5 pb-2 lg:border-b-0 lg:pb-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/50 uppercase tracking-wider">
                  <Settings2 size={14} />
                  <span>Propiedades de {selectedClip.type}</span>
                </div>
                <button
                  type="button"
                  onClick={() => selectClip(null)}
                  className="lg:hidden p-1 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
                  aria-label="Cerrar propiedades"
                >
                  <X size={16} />
                </button>
              </div>

              {selectedClip.type === 'text' && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/70">Texto:</span>
                    <input
                      type="text"
                      value={(selectedClip as TextClip).content}
                      onChange={(e) =>
                        updateClip(selectedClip.id, {
                          content: e.target.value,
                        } as any)
                      }
                      className="bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white w-48 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all"
                      placeholder="Escribe algo..."
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/70">Color:</span>
                    <input
                      type="color"
                      value={(selectedClip as TextClip).style.color}
                      onChange={(e) => {
                        const currentStyle = (selectedClip as TextClip).style;
                        updateClip(selectedClip.id, {
                          style: { ...currentStyle, color: e.target.value },
                        } as any);
                      }}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                  </div>
                </>
              )}

              {(selectedClip.type === 'video' ||
                selectedClip.type === 'audio') && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between w-24">
                      <span className="text-xs text-white/70">Volumen</span>
                      <span className="text-xs text-brand-primary">
                        {Math.round(
                          ((selectedClip as MediaClip).volume ?? 1) * 100,
                        )}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={(selectedClip as MediaClip).volume ?? 1}
                      onChange={(e) =>
                        updateClip(selectedClip.id, {
                          volume: parseFloat(e.target.value),
                        } as any)
                      }
                      className="w-24"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/70">Velocidad:</span>
                    <select
                      value={(selectedClip as MediaClip).speed ?? 1}
                      onChange={(e) =>
                        updateClip(selectedClip.id, {
                          speed: parseFloat(e.target.value),
                        } as any)
                      }
                      className="bg-black/50 text-white text-sm px-2 py-1 rounded outline-none border border-white/10 focus:border-brand-primary"
                    >
                      <option value="0.5">0.5x</option>
                      <option value="1">1.0x</option>
                      <option value="1.5">1.5x</option>
                      <option value="2">2.0x</option>
                    </select>
                  </div>

                  {selectedClip.type === 'video' && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-white/70">Filtro:</span>
                      <select
                        value={(selectedClip as MediaClip).filter ?? ''}
                        onChange={(e) =>
                          updateClip(selectedClip.id, {
                            filter: e.target.value,
                          } as any)
                        }
                        className="bg-black/50 text-white text-sm px-2 py-1 rounded outline-none border border-white/10 focus:border-brand-primary"
                      >
                        <option value="">Ninguno</option>
                        <option value="grayscale(1)">Blanco y Negro</option>
                        <option value="sepia(1)">Sepia</option>
                        <option value="invert(1)">Invertir</option>
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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
