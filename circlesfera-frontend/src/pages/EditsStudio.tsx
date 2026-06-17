import { Download, ImagePlus, PlusSquare, Clock, Trash2 } from 'lucide-react';
import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import PhotoEditor, { type CropData } from '../components/PhotoEditor';
import { useMediaProcessing } from '../hooks/useMediaProcessing';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { useUIStore } from '../stores/uiStore';
import { editsService, type EditProject, type EditProjectState } from '../services/edits.service';
import { exportEditedImage } from '../utils/imageExport';

export default function EditsStudio() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editedFile, setEditedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [projects, setProjects] = useState<EditProject[]>([]);
  const [activeProject, setActiveProject] = useState<EditProject | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { processFiles } = useMediaProcessing();
  const { uploadFiles } = useMediaUpload();
  const navigate = useNavigate();
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await editsService.getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load drafts', err);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const processedFiles = await processFiles(files);
      const fileToEdit = processedFiles[0];
      
      // Upload immediately to get a URL for the draft
      try {
        setIsProcessing(true);
        const uploadedMedia = await uploadFiles([{ file: fileToEdit, type: 'image' }], {});
        if (uploadedMedia.length > 0) {
          const newProject = await editsService.createProject(
            uploadedMedia[0].url,
            uploadedMedia[0].type,
            { filter: '', adjustments: {} } // empty initial state
          );
          setActiveProject(newProject);
          setSelectedFile(fileToEdit);
          setEditedFile(null);
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
      const response = await fetch(project.mediaUrl);
      const blob = await response.blob();
      const file = new File([blob], 'draft.jpg', { type: blob.type });
      setActiveProject(project);
      setSelectedFile(file);
      setEditedFile(null);
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

  const handleStateChange = (state: EditProjectState) => {
    if (activeProject) {
      setActiveProject((prev) => prev ? { ...prev, state } : prev);
    }
  };

  // Debounced auto-save
  useEffect(() => {
    if (!activeProject || !activeProject.state) return;

    const timer = setTimeout(async () => {
      try {
        await editsService.updateProjectState(activeProject.id, activeProject.state);
      } catch (err) {
        console.error('Auto-save failed', err);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [activeProject?.state]);

  const handleSaveEdit = async (file: File, filterString: string, cropData?: CropData) => {
    setIsProcessing(true);
    try {
      const finalImage = await exportEditedImage(file, filterString, cropData);
      setEditedFile(finalImage);
      setSelectedFile(null); // Close editor view
      loadProjects(); // Refresh the preview image if needed
    } catch (err) {
      console.error('Failed to export image:', err);
      alert('Failed to export image.');
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

  if (selectedFile) {
    return (
      <div className="fixed inset-0 z-100 bg-black">
        {isProcessing && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="text-white font-bold animate-pulse">
              Processing Image...
            </div>
          </div>
        )}
        <PhotoEditor
          image={selectedFile}
          initialState={activeProject?.state}
          onStateChange={handleStateChange}
          onSave={handleSaveEdit}
          onCancel={() => {
            setSelectedFile(null);
            setActiveProject(null);
            loadProjects(); // refresh latest state
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20 md:pb-0 pt-16 md:pt-20 px-4 md:px-8 max-w-4xl mx-auto">
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
                  <ImagePlus size={32} className="text-white/40 group-hover:text-white/80" />
                </div>
                <p className="text-white/60 font-medium">Sube una foto nueva</p>
              </button>

              {/* Drafts Gallery */}
              {projects.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={18} className="text-white/60" />
                    <h3 className="text-white font-bold text-lg">Tus Borradores</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        onClick={() => openProject(project)}
                        className="group relative aspect-4/5 bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer hover:ring-2 ring-brand-primary transition-all"
                      >
                        <img
                          src={project.mediaUrl}
                          alt="Draft"
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <span className="text-xs font-bold text-white uppercase">Continuar Edición</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => deleteProject(e, project.id)}
                          className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-red-500/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all"
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
              Descarga tu imagen con calidad profesional o publícala directamente en CircleSfera.
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
