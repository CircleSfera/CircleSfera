import { Download, ImagePlus, PlusSquare } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/common/SEO';
import PhotoEditor from '../components/PhotoEditor';
import { useMediaProcessing } from '../hooks/useMediaProcessing';
import { useUIStore } from '../stores/uiStore';
import { exportEditedImage } from '../utils/imageExport';

export default function EditsStudio() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editedFile, setEditedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { processFiles } = useMediaProcessing();
  const navigate = useNavigate();
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const processedFiles = await processFiles(files);
      setSelectedFile(processedFiles[0]);
      setEditedFile(null); // Reset
    }
  };

  const handleSaveEdit = async (file: File, filterString: string) => {
    setIsProcessing(true);
    try {
      const finalImage = await exportEditedImage(file, filterString);
      setEditedFile(finalImage);
      setSelectedFile(null); // Close editor view
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
          onSave={handleSaveEdit}
          onCancel={() => setSelectedFile(null)}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Workspace Area */}
        <div className="flex flex-col gap-6">
          {!editedFile ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-4/5 md:aspect-square w-full bg-zinc-900/50 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-zinc-800/50 hover:border-white/20 transition-all group"
            >
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ImagePlus size={32} className="text-white/40 group-hover:text-white/80" />
              </div>
              <p className="text-white/60 font-medium">Sube una foto para editar</p>
            </button>
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
