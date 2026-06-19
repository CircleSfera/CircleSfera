import { Clock, Download, ImagePlus, PlusSquare, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import PhotoEditor, {
  type CropData,
  type VideoData,
} from '../components/PhotoEditor';
import { useMediaProcessing } from '../hooks/useMediaProcessing';
import { useMediaUpload } from '../hooks/useMediaUpload';
import {
  type EditProject,
  type EditProjectState,
  editsService,
} from '../services/edits.service';
import { useUIStore } from '../stores/uiStore';
import { exportEditedImage } from '../utils/imageExport';
import { exportEditedVideo } from '../utils/videoExport';

export default function EditsStudio() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [editedFile, setEditedFile] = useState<File | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [projects, setProjects] = useState<EditProject[]>([]);
  const [activeProject, setActiveProject] = useState<EditProject | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { processFiles } = useMediaProcessing();
  const { uploadFiles } = useMediaUpload();
  const navigate = useNavigate();
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);

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

    const timer = setTimeout(async () => {
      try {
        await editsService.updateProjectState(
          activeProject.id,
          activeProject.state,
        );
      } catch (err) {
        console.error('Auto-save failed', err);
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
        finalFile = await exportEditedVideo(
          file,
          filterString,
          videoData,
          overlayDataUrl,
        );
      } else {
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
    // We could pass the file to the create post flow somehow.
    // For now, prompt the user to download it and use the regular flow, or
    // ideally we'd pass it via state. But since useCreatePost uses local state,
    // we can just tell them to download it.
    handleDownload();
    navigate('/');
    setTimeout(() => {
      openCreateMenu();
    }, 500);
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
        {isProcessing && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="text-white font-bold animate-pulse">
              Processing Media...
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 relative">
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
              className="ml-auto flex items-center justify-center gap-2 bg-zinc-800 text-white px-3 py-2 rounded-lg hover:bg-zinc-700 transition-colors shrink-0"
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
    <div className="min-h-screen pb-20 md:pb-0 pt-16 md:pt-20 px-4 md:px-8 max-w-4xl mx-auto">
      <SEO title="Edits Studio | CircleSfera" />

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Edits Studio
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Herramientas profesionales para creadores
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Workspace Area */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {!editedFile ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-video w-full bg-zinc-900/50 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-zinc-800/50 hover:border-white/20 transition-all group"
              >
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ImagePlus
                    size={32}
                    className="text-white/40 group-hover:text-white/80"
                  />
                </div>
                <p className="text-white/60 font-medium">Sube una foto nueva</p>
              </button>

              {/* Drafts Gallery */}
              {projects.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={18} className="text-white/60" />
                    <h3 className="text-white font-bold text-lg">
                      Tus Borradores
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {projects.map((project) => (
                      // biome-ignore lint/a11y/useSemanticElements: container has nested button
                      <div
                        key={project.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openProject(project);
                          }
                        }}
                        onClick={() => openProject(project)}
                        className="group relative aspect-4/5 bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer hover:ring-2 ring-brand-primary transition-all"
                      >
                        <img
                          src={project.mediaUrl}
                          alt="Draft"
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <span className="text-xs font-bold text-white uppercase">
                            Continuar Edición
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            deleteProject(e, project.id);
                          }}
                          className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-red-500/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all z-20"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="aspect-4/5 md:aspect-square bg-zinc-900 rounded-3xl overflow-hidden relative group">
              <img
                src={URL.createObjectURL(editedFile)}
                alt="Edited output"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setEditedFile(null)}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white font-medium backdrop-blur-md transition-colors"
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
          <div className="glass-panel p-6 rounded-3xl border border-white/5">
            <h3 className="text-white font-bold text-lg mb-2">Exportar</h3>
            <p className="text-white/50 text-sm mb-6">
              Descarga tu imagen con calidad profesional o publícala
              directamente en CircleSfera.
            </p>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={!editedFile}
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-3 py-3.5 bg-brand-primary text-white font-bold rounded-xl hover:bg-brand-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={20} />
                Guardar en el dispositivo
              </button>

              <button
                type="button"
                disabled={!editedFile}
                onClick={handleCreatePost}
                className="w-full flex items-center justify-center gap-3 py-3.5 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlusSquare size={20} />
                Crear publicación
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
