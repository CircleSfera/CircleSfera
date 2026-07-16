import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { adminApi, type FirewallSignature } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { LoadingSpinner } from '../index';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { Pagination } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function FirewallTab({ onToast }: Props) {
  const [page, setPage] = useState(1);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('SPAM');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<FirewallSignature>>({
    queryKey: ['admin', 'firewall', page],
    queryFn: () =>
      adminApi
        .getFirewallSignatures(page, 20)
        .then((res) => res.data as PaginatedResponse<FirewallSignature>),
  });

  const addMutation = useMutation({
    mutationFn: () => adminApi.addFirewallSignature(newText, newCategory),
    onSuccess: () => {
      onToast('Regla vectorial añadida con éxito', 'success');
      setNewText('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall'] });
    },
    onError: () => onToast('Error al añadir la regla', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteFirewallSignature(id),
    onSuccess: () => {
      onToast('Regla eliminada correctamente', 'success');
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall'] });
    },
    onError: () => onToast('Error al eliminar regla', 'error'),
  });

  const items = data?.data || [];

  return (
    <div className="flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-brand-primary/10 border border-brand-primary/20 rounded-xl">
          <ShieldCheck size={20} className="text-brand-primary" />
        </div>
        <div>
          <h2 className="text-lg font-black text-white">
            Escudo de IA (Vector Firewall)
          </h2>
          <p className="text-xs text-gray-500">
            Reglas vectoriales que bloquean automáticamente contenido antes de
            publicarse.
          </p>
        </div>
      </div>

      {/* Add New Rule Form */}
      <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white">Añadir nueva regla</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Ej: Gana dinero gratis haciendo click en este link..."
            className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-primary"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-primary"
          >
            <option value="SPAM">SPAM</option>
            <option value="HATE">HATE</option>
            <option value="SEXUAL">SEXUAL</option>
            <option value="VIOLENCE">VIOLENCE</option>
            <option value="SCAM">SCAM</option>
          </select>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!newText.trim() || addMutation.isPending}
            isLoading={addMutation.isPending}
          >
            Generar Vector
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Al generar el vector, el sistema bloqueará textos futuros que tengan
          un 90% o más de similitud semántica con esta frase.
        </p>
      </div>

      {/* Rules List */}
      <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/2">
                <th className="px-4 py-3 text-xs font-bold text-gray-300 uppercase">
                  Texto Origen (Preview)
                </th>
                <th className="px-4 py-3 text-xs font-bold text-gray-300 uppercase">
                  Categoría
                </th>
                <th className="px-4 py-3 text-xs font-bold text-gray-300 uppercase">
                  Fecha creación
                </th>
                <th className="px-4 py-3 text-xs font-bold text-gray-300 uppercase text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center">
                    <LoadingSpinner />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-8 text-center text-gray-500 text-sm"
                  >
                    No hay reglas vectoriales activas.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-white/2 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-white max-w-md truncate">
                        {item.text || (
                          <span className="text-gray-500 italic">
                            Vector generado automáticamente (sin preview)
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono mt-1">
                        ID: {item.id.split('-')[0]}...
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-bold rounded-full border border-red-500/20">
                        {item.category.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {new Date(item.createdAt).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteId(item.id)}
                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Eliminar regla (falso positivo)"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data?.meta && data.meta.totalPages > 1 && (
          <div className="p-4 border-t border-white/5">
            <Pagination meta={data.meta} onPageChange={setPage} />
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteId}
        title="Eliminar regla vectorial"
        message="¿Estás seguro de que deseas eliminar esta firma del Firewall? El contenido similar dejará de ser bloqueado automáticamente."
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onClose={() => setDeleteId(null)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
