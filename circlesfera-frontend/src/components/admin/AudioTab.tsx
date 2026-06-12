import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Music, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { AdminAudio } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { ActionButton, Pagination, SearchInput, Table } from './AdminTable';

interface AudioTabProps {
  onToast: (message: string, type: 'success' | 'error') => void;
}

interface AudioForm {
  title: string;
  artist: string;
  url: string;
  thumbnailUrl: string;
  duration: number;
}

const EMPTY_FORM: AudioForm = {
  title: '',
  artist: '',
  url: '',
  thumbnailUrl: '',
  duration: 0,
};

export default function AudioTab({ onToast }: AudioTabProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTrack, setEditingTrack] = useState<AdminAudio | null>(null);
  const [form, setForm] = useState<AudioForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AdminAudio | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audio', page, search],
    queryFn: async () => {
      const res = await adminApi.getAudio(page, 10, search || undefined);
      return res.data;
    },
  });

  const invalidateAudio = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'audio'] });
    queryClient.invalidateQueries({ queryKey: ['music'] });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTrack(null);
    setForm(EMPTY_FORM);
  };

  const createMutation = useMutation({
    mutationFn: (
      data: Omit<AudioForm, 'thumbnailUrl'> & { thumbnailUrl?: string },
    ) => adminApi.createAudio(data),
    onSuccess: () => {
      invalidateAudio();
      onToast('Pista de audio añadida', 'success');
      closeForm();
    },
    onError: () => onToast('Error al crear la pista', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Omit<AudioForm, 'thumbnailUrl'> & { thumbnailUrl?: string };
    }) => adminApi.updateAudio(id, data),
    onSuccess: () => {
      invalidateAudio();
      onToast('Pista actualizada', 'success');
      closeForm();
    },
    onError: () => onToast('Error al actualizar la pista', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteAudio(id),
    onSuccess: () => {
      invalidateAudio();
      onToast('Pista eliminada', 'success');
      setDeleteTarget(null);
    },
    onError: () => onToast('Error al eliminar la pista', 'error'),
  });

  const openEdit = (track: AdminAudio) => {
    setEditingTrack(track);
    setForm({
      title: track.title,
      artist: track.artist,
      url: track.url,
      thumbnailUrl: track.thumbnailUrl ?? '',
      duration: track.duration,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.artist || !form.url || form.duration <= 0) return;
    const payload = { ...form, thumbnailUrl: form.thumbnailUrl || undefined };

    if (editingTrack) {
      updateMutation.mutate({ id: editingTrack.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const tracks = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Biblioteca de Música</h2>
          <p className="text-gray-500 text-sm mt-1">
            Gestiona las pistas de audio disponibles para stories y posts
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingTrack(null);
            setForm(EMPTY_FORM);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-primary/80 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-brand-primary/20"
        >
          <Plus size={16} />
          Añadir pista
        </button>
      </div>

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por título o artista..."
      />

      {/* Table */}
      <Table
        headers={['Pista', 'Artista', 'Duración', 'Fecha', 'Acciones']}
        loading={isLoading}
        isEmpty={tracks.length === 0}
      >
        {tracks.map((track) => (
          <tr
            key={track.id}
            className="border-b border-white/5 hover:bg-white/2 transition-colors"
          >
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                  {track.thumbnailUrl ? (
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music size={16} className="text-zinc-500" />
                  )}
                </div>
                <span className="font-medium text-sm truncate max-w-[200px]">
                  {track.title}
                </span>
              </div>
            </td>
            <td className="px-4 py-3 text-sm text-zinc-400">{track.artist}</td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                <Clock size={12} />
                {formatDuration(track.duration)}
              </div>
            </td>
            <td className="px-4 py-3 text-sm text-zinc-500">
              {new Date(track.createdAt).toLocaleDateString()}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1">
                <ActionButton
                  icon={Pencil}
                  label="Editar"
                  variant="ghost"
                  onClick={() => openEdit(track)}
                />
                <ActionButton
                  icon={Trash2}
                  label="Eliminar"
                  variant="danger"
                  onClick={() => setDeleteTarget(track)}
                />
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta} onPageChange={setPage} />
      )}

      {/* Add / Edit Track Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {editingTrack
                  ? 'Editar pista de audio'
                  : 'Añadir pista de audio'}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="audio-title"
                    className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider"
                  >
                    Título *
                  </label>
                  <input
                    id="audio-title"
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-zinc-500"
                    placeholder="Nombre de la canción"
                  />
                </div>
                <div>
                  <label
                    htmlFor="audio-artist"
                    className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider"
                  >
                    Artista *
                  </label>
                  <input
                    id="audio-artist"
                    type="text"
                    required
                    value={form.artist}
                    onChange={(e) =>
                      setForm({ ...form, artist: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-zinc-500"
                    placeholder="Nombre del artista"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="audio-url"
                  className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider"
                >
                  URL del audio *
                </label>
                <input
                  id="audio-url"
                  type="url"
                  required
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-zinc-500"
                  placeholder="https://example.com/audio.mp3"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="audio-thumbnail"
                    className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider"
                  >
                    Thumbnail URL
                  </label>
                  <input
                    id="audio-thumbnail"
                    type="url"
                    value={form.thumbnailUrl}
                    onChange={(e) =>
                      setForm({ ...form, thumbnailUrl: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-zinc-500"
                    placeholder="https://example.com/cover.jpg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="audio-duration"
                    className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider"
                  >
                    Duración (seg) *
                  </label>
                  <input
                    id="audio-duration"
                    type="number"
                    required
                    min={1}
                    value={form.duration || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        duration: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-zinc-500"
                    placeholder="180"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-zinc-300 hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  {isSaving
                    ? editingTrack
                      ? 'Guardando...'
                      : 'Añadiendo...'
                    : editingTrack
                      ? 'Guardar cambios'
                      : 'Añadir pista'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-400" size={24} />
              </div>
              <h3 className="text-lg font-bold mb-2">Eliminar pista</h3>
              <p className="text-sm text-zinc-400">
                ¿Estás seguro de que quieres eliminar{' '}
                <span className="text-white font-medium">
                  "{deleteTarget.title}"
                </span>{' '}
                de {deleteTarget.artist}?
              </p>
            </div>
            <div className="flex gap-3 p-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-zinc-300 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
