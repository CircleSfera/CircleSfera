import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Music, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminAudio } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import AdminDrawer from './AdminDrawer';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
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
  const debouncedSearch = useDebouncedValue(search, 400);
  const [showForm, setShowForm] = useState(false);
  const [editingTrack, setEditingTrack] = useState<AdminAudio | null>(null);
  const [form, setForm] = useState<AudioForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AdminAudio | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audio', page, debouncedSearch],
    queryFn: async () => {
      const res = await adminApi.getAudio(
        page,
        10,
        debouncedSearch || undefined,
      );
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
  const isFiltered = debouncedSearch.length > 0;

  const openAddForm = () => {
    setEditingTrack(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Biblioteca de Música"
        subtitle="Gestiona las pistas de audio disponibles para stories y posts"
        actions={
          <Button
            onClick={openAddForm}
            variant="primary"
            className="text-sm font-semibold min-h-11 w-full sm:w-auto shadow-lg shadow-brand-primary/20 px-5"
          >
            <Plus size={16} className="mr-2" />
            Añadir pista
          </Button>
        }
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por título o artista..."
          />
        </div>
      </AdminFilterBar>

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={tracks.length === 0}
          emptyTitle={isFiltered ? 'Sin resultados' : 'No hay pistas'}
          emptyDescription={
            isFiltered
              ? 'Prueba con otro título o artista.'
              : 'Añade la primera pista para la biblioteca de música.'
          }
          emptyIcon={Music}
          emptyAction={
            !isFiltered ? (
              <Button onClick={openAddForm} className="min-h-11">
                <Plus size={16} className="mr-2" />
                Añadir pista
              </Button>
            ) : undefined
          }
          mobile={
            <div className="space-y-2">
              {tracks.map((track) => (
                <AdminListRow
                  key={track.id}
                  title={track.title}
                  subtitle={track.artist}
                  meta={
                    <>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} />
                        {formatDuration(track.duration)}
                      </span>
                      <span>
                        {new Date(track.createdAt).toLocaleDateString()}
                      </span>
                    </>
                  }
                  avatar={
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                      {track.thumbnailUrl ? (
                        <img
                          src={track.thumbnailUrl}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music size={16} className="text-zinc-400" />
                      )}
                    </div>
                  }
                  primaryAction={
                    <ActionButton
                      icon={Pencil}
                      label="Editar"
                      variant="ghost"
                      onClick={() => openEdit(track)}
                    />
                  }
                  secondaryActions={[
                    {
                      label: 'Eliminar',
                      variant: 'danger',
                      onClick: () => setDeleteTarget(track),
                    },
                  ]}
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={['Pista', 'Artista', 'Duración', 'Fecha', 'Acciones']}
              columnWidths={[
                'min-w-[10rem]',
                'min-w-[6rem]',
                'w-[4.5rem]',
                'hidden lg:table-cell w-[6rem]',
                'w-[6rem]',
              ]}
              loading={false}
              isEmpty={false}
            >
              {tracks.map((track) => (
                <tr
                  key={track.id}
                  className="border-b border-white/5 hover:bg-white/2 transition-colors"
                >
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                        {track.thumbnailUrl ? (
                          <img
                            src={track.thumbnailUrl}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music size={16} className="text-zinc-400" />
                        )}
                      </div>
                      <div
                        className="font-semibold text-sm truncate max-w-[10rem] xl:max-w-[14rem]"
                        title={track.title}
                      >
                        {track.title}
                      </div>
                    </div>
                  </td>
                  <td
                    className="px-2 py-1 text-sm text-zinc-400"
                    data-label="Artista"
                  >
                    <div
                      className="truncate max-w-[8rem] xl:max-w-[12rem]"
                      title={track.artist}
                    >
                      {track.artist}
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1 text-sm text-zinc-400">
                      <Clock size={12} />
                      {formatDuration(track.duration)}
                    </div>
                  </td>
                  <td
                    className="px-2 py-1 text-sm text-zinc-400 hidden lg:table-cell"
                    data-label="Subido el"
                  >
                    {new Date(track.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-1">
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
          }
        />
        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <Pagination meta={meta} onPageChange={setPage} />
        )}
      </div>

      {/* Add / Edit Track Drawer */}
      <AdminDrawer
        isOpen={showForm}
        onClose={closeForm}
        title={editingTrack ? 'Editar pista de audio' : 'Añadir pista de audio'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <label
              htmlFor="audio-title"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
            >
              Título *
            </label>
            <input
              id="audio-title"
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-brand-primary transition-colors"
              placeholder="Nombre de la canción"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="audio-artist"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
            >
              Artista *
            </label>
            <input
              id="audio-artist"
              type="text"
              required
              value={form.artist}
              onChange={(e) => setForm({ ...form, artist: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-brand-primary transition-colors"
              placeholder="Nombre del artista"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="audio-url"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
            >
              URL del audio *
            </label>
            <input
              id="audio-url"
              type="url"
              required
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-brand-primary transition-colors"
              placeholder="https://example.com/audio.mp3"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="audio-thumbnail"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-brand-primary transition-colors"
              placeholder="https://example.com/cover.jpg"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="audio-duration"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-brand-primary transition-colors"
              placeholder="180"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              onClick={closeForm}
              variant="secondary"
              className="flex-1 py-3 font-semibold bg-white/5 border-transparent text-gray-300"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              isLoading={isSaving}
              variant="primary"
              className="flex-1 py-3 font-semibold shadow-lg shadow-brand-primary/20"
            >
              {editingTrack ? 'Guardar cambios' : 'Añadir pista'}
            </Button>
          </div>
        </form>
      </AdminDrawer>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Eliminar pista"
        message={
          deleteTarget
            ? `¿Estás seguro de que quieres eliminar "${deleteTarget.title}" de ${deleteTarget.artist}?`
            : ''
        }
        confirmText={deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
        cancelText="Cancelar"
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
