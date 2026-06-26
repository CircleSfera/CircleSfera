import { Clock, Download, ImagePlus, PlusSquare, Trash2, Wand2 } from 'lucide-react';
import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import type { CropData, VideoData } from '../components/PhotoEditor';

const PhotoEditor = lazy(() => import('../components/PhotoEditor'));

import { useMediaProcessing } from '../hooks/useMediaProcessing';
import { useMediaUpload } from '../hooks/useMediaUpload';
import {
  type EditProject,
  type EditProjectState,
  editsService,
} from '../services/edits.service';
import { useUIStore } from '../stores/uiStore';

export default function EditsStudio() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [editedFile, setEditedFile] = useState<File | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [projects, setProjects] = useState<EditProject[]>([]);
  const [activeProject, setActiveProject] = useState<EditProject | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { processFiles } = useMediaProcessing();
  const { uploadFiles } = useMediaUpload();
  const navigate = useNavigate();
  const { setEditedMediaForPost } = useUIStore();

  const loadProjects = useCallback(async () => {
    try {
      const data = await editsService.getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load drafts', err);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const processedFiles = await processFiles(files);

      // Upload immediately to get URLs for the draft
      try {
        setIsProcessing(true);
        const uploadPromises = processedFiles.map((file) =>
          uploadFiles(
            [{ file, type: file.type.startsWith('video') ? 'video' : 'image' }],
            {},
          ),
        );
        const allUploaded = await Promise.all(uploadPromises);
        const flattened = allUploaded.map((res) => res[0]);

        if (flattened.length > 0) {
          const items = flattened.map((up) => ({
            mediaUrl: up.url,
            mediaType: up.type,
            state: {
              filter: '',
              adjustments: {
                brightness: 100,
                contrast: 100,
                saturation: 100,
                sepia: 0,
                grayscale: 0,
                hue: 0,
                blur: 0,
                temperature: 100,
                vignette: 0,
                noise: 0,
              },
            },
          }));

          const batchState: EditProjectState = {
            version: 2,
            items,
          };

          const newProject = await editsService.createProject(
            flattened[0].url,
            flattened[0].type,
            batchState,
          );
          setActiveProject(newProject);
          setSelectedFiles(processedFiles);
          setCurrentIndex(0);
          loadProjects(); // refresh gallery
        }
      } catch (err) {
        console.error('Failed to upload draft', err);
        alert('Error creating draft project.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const openProject = async (project: EditProject) => {
    setIsProcessing(true);
    try {
      if ('version' in project.state && project.state.version === 2) {
        const filePromises = project.state.items.map(async (item) => {
          const response = await fetch(item.mediaUrl);
          const blob = await response.blob();
          return new File(
            [blob],
            `draft.${item.mediaType.startsWith('video') ? 'mp4' : 'jpg'}`,
            { type: blob.type },
          );
        });
        const files = await Promise.all(filePromises);
        setActiveProject(project);
        setSelectedFiles(files);
        setCurrentIndex(0);
      } else {
        const response = await fetch(project.mediaUrl);
        const blob = await response.blob();
        const file = new File([blob], 'draft.jpg', { type: blob.type });
        setActiveProject(project);
        setSelectedFiles([file]);
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error('Failed to load project media', err);
      alert('Error loading project.');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await editsService.deleteProject(id);
      loadProjects();
    } catch (err) {
      console.error('Failed to delete draft', err);
    }
  };

  const handleStateChange = (state: any) => {
    if (activeProject) {
      setActiveProject((prev) => {
        if (!prev) return prev;
        if ('version' in prev.state && prev.state.version === 2) {
          const newItems = [...prev.state.items];
          newItems[currentIndex] = {
            ...newItems[currentIndex],
            state,
          };
          return { ...prev, state: { ...prev.state, items: newItems } };
        } else {
          // Legacy upgrade on the fly
          return {
            ...prev,
            state: {
              version: 2,
              items: [
                { mediaUrl: prev.mediaUrl, mediaType: prev.mediaType, state },
              ],
            } as any,
          };
        }
      });
    }
  };

  // Debounced auto-save
  useEffect(() => {
    if (!activeProject?.state) return;
    setIsSaving(true);

    const timer = setTimeout(async () => {
      try {
        await editsService.updateProjectState(
          activeProject.id,
          activeProject.state,
        );
      } catch (err) {
        console.error('Auto-save failed', err);
      } finally {
        setIsSaving(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [activeProject]);

  const handleSaveEdit = async (
    file: File,
    filterString: string,
    cropData?: CropData,
    overlayDataUrl?: string,
    videoData?: VideoData,
  ) => {
    setIsProcessing(true);
    try {
      let finalFile: File;
      if (file.type.startsWith('video')) {
        const { exportEditedVideo } = await import('../utils/videoExport');
        finalFile = await exportEditedVideo(
          file,
          filterString,
          videoData,
          overlayDataUrl,
        );
      } else {
        const { exportEditedImage } = await import('../utils/imageExport');
        finalFile = await exportEditedImage(
          file,
          filterString,
          cropData,
          overlayDataUrl,
        );
      }

      setEditedFile(finalFile);
      setSelectedFiles([]); // Close editor view
      loadProjects(); // Refresh the preview image if needed
    } catch (err) {
      console.error('Failed to export media:', err);
      alert('Failed to export media.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!editedFile) return;
    const url = URL.createObjectURL(editedFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = editedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreatePost = () => {
    if (!editedFile) return;
    setEditedMediaForPost(editedFile);
    navigate('/create');
  };

  const handleApplyToAll = () => {
    if (!activeProject || !('version' in activeProject.state)) return;
    const currentState = activeProject.state.items[currentIndex].state;

    setActiveProject((prev) => {
      if (!prev || !('version' in prev.state)) return prev;
      const newItems = prev.state.items.map((item, idx) => {
        if (idx === currentIndex) return item;
        return {
          ...item,
          state: {
            ...item.state,
            filter: currentState.filter,
            adjustments: { ...currentState.adjustments },
          },
        };
      });
      return { ...prev, state: { ...prev.state, items: newItems } };
    });
  };

  if (selectedFiles.length > 0) {
    const activeState =
      activeProject?.state && 'version' in activeProject.state
        ? activeProject.state.items[currentIndex].state
        : activeProject?.state;

    return (
      <div className="fixed inset-0 z-100 bg-black flex flex-col">
        {isSaving && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-60 bg-black/80 backdrop-blur border border-white/10 px-3 py-1 rounded-full text-xs font-bold text-white flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-ping" />
            Guardando...
          </div>
        )}
        {isProcessing && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="text-white font-bold animate-pulse">
              Processing Media...
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 relative">
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center text-white/50 animate-pulse">
                Cargando Editor...
              </div>
            }
          >
            <PhotoEditor
              key={currentIndex}
              image={selectedFiles[currentIndex]}
              initialState={activeState}
              onStateChange={handleStateChange}
              onSave={handleSaveEdit}
              onCancel={() => {
                setSelectedFiles([]);
              }}
            />
          </Suspense>
        </div>

        {/* Carousel UI */}
        {selectedFiles.length > 1 && (
          <div className="h-[90px] bg-zinc-950 border-t border-white/10 flex items-center px-4 gap-3 overflow-x-auto no-scrollbar shrink-0 pb-safe">
            {selectedFiles.map((file, i) => (
              <button
                type="button"
                key={file.name}
                onClick={() => setCurrentIndex(i)}
                className={`relative w-14 h-14 shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                  i === currentIndex
                    ? 'border-blue-500'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                {file.type.startsWith('video') ? (
                  <video
                    src={URL.createObjectURL(file)}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Thumbnail ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                )}
              </button>
            ))}

            <button
              type="button"
              onClick={handleApplyToAll}
              className="ml-auto flex items-center justify-center gap-2 bg-zinc-800 text-white px-2 py-1 rounded-lg hover:bg-zinc-700 transition-colors shrink-0"
              title="Apply filters to all"
            >
              <ImagePlus size={18} />
              <span className="text-xs font-semibold">Apply to All</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-20 md:pb-0 pt-16 md:pt-20 px-4 lg:px-8 max-w-7xl mx-auto relative w-full overflow-hidden">
      <SEO title="Edits Studio | CircleSfera" />

      {/* Immersive background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-primary/20 rounded-full blur-[120px] opacity-40 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px] opacity-30 pointer-events-none" />

      <div className="relative flex items-center justify-between mb-8 z-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Edits Studio
          </h1>
          <p className="text-white/50 text-base mt-2">
            Herramientas profesionales para creadores
          </p>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Workspace Area */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {!editedFile ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative aspect-video lg:aspect-21/9 w-full rounded-[32px] flex flex-col items-center justify-center gap-6 cursor-pointer overflow-hidden group transition-all duration-500 hover:scale-[1.01]"
              >
                {/* Glassmorphism Background */}
                <div className="absolute inset-0 bg-white/5 backdrop-blur-xl border border-white/10 group-hover:bg-white/10 transition-colors" />
                
                {/* Glowing border effect */}
                <div className="absolute inset-0 rounded-[32px] bg-linear-to-r from-brand-primary via-purple-500 to-pink-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />
                
                <div className="relative w-20 h-20 rounded-full bg-linear-to-br from-brand-primary to-purple-600 p-[2px] shadow-[0_0_40px_rgba(131,58,180,0.3)] group-hover:shadow-[0_0_60px_rgba(131,58,180,0.5)] transition-all duration-500 group-hover:-translate-y-2">
                  <div className="w-full h-full bg-black rounded-full flex items-center justify-center backdrop-blur-md">
                    <ImagePlus
                      size={32}
                      className="text-white group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                </div>
                <div className="relative text-center">
                  <h3 className="text-xl font-bold text-white mb-1">Arrastra tu arte aquí</h3>
                  <p className="text-white/50 font-medium">o haz clic para explorar tus archivos</p>
                </div>
              </button>

              {/* Drafts Gallery */}
              {projects.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                      <Clock size={20} className="text-white/80" />
                    </div>
                    <h3 className="text-white font-bold text-xl tracking-tight">
                      Tus Borradores
                    </h3>
                  </div>
                  <div className="flex overflow-x-auto gap-4 pb-6 snap-x snap-mandatory no-scrollbar">
                    {projects.map((project) => (
                      <div key={project.id} className="relative flex-none w-[280px] snap-center group">
                        <button
                          type="button"
                          onClick={() => openProject(project)}
                          className="relative aspect-4/5 w-full bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer hover:ring-2 ring-brand-primary/50 transition-all block text-left p-0 border border-white/10 shadow-2xl group-hover:-translate-y-2 duration-300"
                        >
                          <img
                            src={project.mediaUrl}
                            alt="Draft"
                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                          />
                          <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/20 to-transparent opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
                            <span className="px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-sm font-bold text-white transition-colors flex items-center gap-2">
                              <Wand2 size={16} /> Continuar Edición
                            </span>
                          </div>
                        </button>
                        <div className="absolute top-3 right-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => deleteProject(e, project.id)}
                            className="p-2 bg-black/60 backdrop-blur-md border border-white/10 hover:bg-red-500 hover:border-red-500 text-white/70 hover:text-white rounded-full transition-all shadow-xl"
                            aria-label="Eliminar borrador"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="aspect-4/5 md:aspect-square bg-zinc-900 rounded-[32px] overflow-hidden relative group border border-white/10 shadow-2xl">
              <img
                src={URL.createObjectURL(editedFile)}
                alt="Edited output"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-black/50 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setEditedFile(null)}
                  className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full text-white font-bold backdrop-blur-md transition-colors border border-white/20 shadow-xl"
                >
                  Descartar
                </button>
              </div>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
          />
        </div>

        {/* Actions / Export Area */}
        <div className="flex flex-col gap-4">
          <div className="relative p-6 rounded-[32px] border border-white/10 bg-white/5 backdrop-blur-2xl overflow-hidden shadow-2xl">
            {/* Inner subtle glow */}
            <div className="absolute inset-0 bg-linear-to-br from-brand-primary/10 to-transparent opacity-50 pointer-events-none" />
            
            <div className="relative">
              <h3 className="text-white font-bold text-2xl mb-3 flex items-center gap-3">
                <Wand2 size={24} className="text-brand-primary" />
                Exportar
              </h3>
              <p className="text-white/50 text-base mb-8 leading-relaxed">
                Descarga tu imagen con calidad profesional o publícala directamente en CircleSfera de forma instantánea.
              </p>

              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  disabled={!editedFile}
                  onClick={handleCreatePost}
                  className="w-full relative group overflow-hidden flex items-center justify-center gap-3 py-4 bg-brand-primary text-white font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(131,58,180,0.3)]"
                >
                  <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  <PlusSquare size={22} />
                  Crear publicación
                </button>

                <button
                  type="button"
                  disabled={!editedFile}
                  onClick={handleDownload}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={22} className="text-white/70" />
                  Guardar en el dispositivo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
