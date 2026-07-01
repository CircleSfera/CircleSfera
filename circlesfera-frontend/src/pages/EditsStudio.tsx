import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cloud,
  Download,
  FolderOpen,
  Music,
  Pause,
  Play,
  Plus,
  Scissors,
  Trash2,
  Type,
  X,
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
    updateClip,
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

  return (
    <div className="flex flex-col h-dvh bg-black text-white overflow-hidden">
      <SEO title="Studio | CircleSfera" />

      {/* Exporting Overlay */}
      {isExporting && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur flex flex-col items-center justify-center">
          <div className="w-64 bg-zinc-900 rounded-full h-2 overflow-hidden border border-white/10">
            <div
              className="h-full bg-brand-primary transition-all duration-300"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
          <p className="mt-4 text-white font-bold">
            Exportando... {Math.round(exportProgress)}%
          </p>
        </div>
      )}

      {/* Export Success Overlay */}
      {exportedBlob && !isExporting && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center">
          <h2 className="text-2xl font-bold text-white mb-8">¡Vídeo listo!</h2>
          <div className="flex flex-col gap-4 w-64">
            <Button
              variant="primary"
              onClick={handlePublish}
              className="w-full"
            >
              Publicar en CircleSfera
            </Button>
            <Button
              variant="secondary"
              onClick={handleDownload}
              className="w-full"
            >
              Descargar al dispositivo
            </Button>
            <button
              type="button"
              onClick={() => setExportedBlob(null)}
              className="mt-4 text-white/60 hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Drafts Modal */}
      {showDraftsModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur flex flex-col items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-[90%] max-w-md p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Mis Borradores</h2>
              <button type="button" onClick={() => setShowDraftsModal(false)}>
                <X size={20} />
              </button>
            </div>
            {!drafts || drafts.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">
                No tienes borradores guardados
              </p>
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
                        className="flex items-center gap-4 bg-zinc-800 p-4 rounded-xl hover:bg-zinc-700 transition-colors text-left"
                      >
                        <div className="w-12 h-12 bg-zinc-700 rounded flex flex-col items-center justify-center">
                          <FolderOpen size={20} />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-white truncate">
                            {draft.name || studio?.name || 'Proyecto'}
                          </h3>
                          <p className="text-xs text-zinc-400">
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
      )}

      {/* Top Navbar */}
      <div className="h-14 flex items-center justify-between px-4 shrink-0 border-b border-white/10 z-10 bg-zinc-950">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-white/10 rounded-full"
        >
          <X size={20} />
        </button>
        <span className="font-bold hidden md:inline">{project?.name}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDraftsModal(true)}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
          >
            <FolderOpen size={16} />
            <span className="hidden md:inline">Borradores</span>
          </button>
          <button
            type="button"
            onClick={() => saveDraftMutation.mutate()}
            disabled={saveDraftMutation.isPending}
            className="flex items-center gap-1.5 text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/10 px-3 py-1.5 rounded-full text-sm font-bold transition-colors disabled:opacity-50"
          >
            <Cloud size={16} />
            <span className="hidden md:inline">
              {saveDraftMutation.isPending ? 'Guardando...' : 'Guardar'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 bg-brand-primary text-white px-3 py-1.5 rounded-full text-sm font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </div>

      {/* Preview Area (Top/Middle) */}
      <div className="flex-1 relative overflow-hidden bg-black flex flex-col">
        <StudioPlayer />

        {/* Playback Controls Overlay */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10">
          <button
            type="button"
            onClick={togglePlayback}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            {isPlaying ? (
              <Pause size={24} className="fill-white" />
            ) : (
              <Play size={24} className="fill-white" />
            )}
          </button>
        </div>
      </div>

      {/* Timeline Area (Bottom) */}
      <div className="h-[40vh] min-h-[300px] flex flex-col shrink-0">
        {/* Timeline Tools */}
        {selectedClip?.type === 'text' && (
          <div className="h-12 bg-zinc-800 flex items-center px-4 gap-4 border-t border-white/10 shrink-0">
            <input
              type="text"
              value={(selectedClip as TextClip).content}
              onChange={(e) =>
                updateClip(selectedClip.id, { content: e.target.value } as any)
              }
              className="bg-black/50 border border-white/20 rounded px-3 py-1 text-sm text-white flex-1 outline-none focus:border-brand-primary"
              placeholder="Escribe algo..."
            />
            <input
              type="color"
              value={(selectedClip as TextClip).style.color}
              onChange={(e) => {
                const currentStyle = (selectedClip as TextClip).style;
                updateClip(selectedClip.id, {
                  style: { ...currentStyle, color: e.target.value },
                } as any);
              }}
              className="w-8 h-8 rounded cursor-pointer bg-transparent"
            />
          </div>
        )}

        {/* Media Properties Tools */}
        {(selectedClip?.type === 'video' || selectedClip?.type === 'audio') && (
          <div className="bg-zinc-800 flex items-center px-4 py-2 gap-6 border-t border-white/10 shrink-0 overflow-x-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70">Volumen:</span>
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
                className="w-24 accent-brand-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70">Velocidad:</span>
              <select
                value={(selectedClip as MediaClip).speed ?? 1}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    speed: parseFloat(e.target.value),
                  } as any)
                }
                className="bg-black text-white text-xs px-2 py-1 rounded outline-none"
              >
                <option value="0.5">0.5x</option>
                <option value="1">1.0x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2.0x</option>
              </select>
            </div>

            {selectedClip.type === 'video' && (
              <div className="flex items-center gap-2 ml-4 border-l border-white/10 pl-4">
                <span className="text-xs text-white/70">Filtro:</span>
                <select
                  value={(selectedClip as MediaClip).filter ?? ''}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      filter: e.target.value,
                    } as any)
                  }
                  className="bg-black text-white text-xs px-2 py-1 rounded outline-none"
                >
                  <option value="">Normal</option>
                  <option value="grayscale(1)">Blanco y Negro</option>
                  <option value="sepia(1)">Sepia</option>
                  <option value="invert(1)">Invertir</option>
                </select>
              </div>
            )}
          </div>
        )}

        <div className="h-12 bg-zinc-900 flex items-center px-4 gap-4 border-t border-white/10 shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-white/80 hover:text-white"
          >
            <Plus size={18} />
            <span className="text-sm font-medium">Agregar</span>
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            type="button"
            onClick={splitClip}
            disabled={!selectedClipId}
            className="flex items-center gap-2 text-white/80 hover:text-white disabled:opacity-50"
          >
            <Scissors size={18} />
            <span className="text-sm font-medium">Dividir</span>
          </button>
          <button
            type="button"
            onClick={() => selectedClipId && removeClip(selectedClipId)}
            disabled={!selectedClipId}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            <Trash2 size={18} />
            <span className="text-sm font-medium">Eliminar</span>
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            type="button"
            onClick={handleAddText}
            className="flex items-center gap-2 text-white/80 hover:text-white"
          >
            <Type size={18} />
            <span className="text-sm font-medium">Texto</span>
          </button>
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="flex items-center gap-2 text-white/80 hover:text-white"
          >
            <Music size={18} />
            <span className="text-sm font-medium">Audio</span>
          </button>
        </div>

        {/* Timeline Container */}
        <div className="flex-1 overflow-hidden">
          <Timeline />
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
