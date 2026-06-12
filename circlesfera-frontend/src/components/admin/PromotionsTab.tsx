import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ExternalLink, Megaphone, Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
  StatusBadge,
  Table,
} from './AdminTable';

interface AdminPromotion {
  id: string;
  userId: string;
  targetType: string;
  targetId: string;
  budget: number;
  currency: string;
  status: string;
  startDate: string;
  endDate: string;
  reach: number;
  createdAt: string;
  user: {
    email: string;
    profile: {
      username: string;
      avatar: string;
    };
  };
  target?: any;
}

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function PromotionsTab({ onToast }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<AdminPromotion>>({
    queryKey: ['admin', 'promotions', page, debouncedSearch, statusFilter],
    queryFn: () =>
      adminApi
        .getPromotions(
          page,
          10,
          statusFilter || undefined,
          debouncedSearch || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminPromotion>),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: string;
      note?: string;
    }) => adminApi.updatePromotion(id, status, note),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
      const msg =
        variables.status === 'ACTIVE'
          ? 'Promoción aprobada'
          : 'Promoción rechazada';
      onToast(msg, 'success');
    },
    onError: () => onToast('Error al actualizar promoción', 'error'),
  });

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Buscar por usuario..."
        />
        <FilterDropdown
          label="Estado"
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'PENDING', label: 'Pendientes' },
            { value: 'ACTIVE', label: 'Activas' },
            { value: 'COMPLETED', label: 'Completadas' },
            { value: 'REJECTED', label: 'Rechazadas' },
          ]}
        />
      </div>

      <div className="glass-panel rounded-2xl overflow-clip border border-white/10">
        <Table
          headers={[
            'Creador',
            'Contenido',
            'Presupuesto',
            'Alcance',
            'Estado',
            'Acciones',
          ]}
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
        >
          {data?.data.map((promo) => (
            <motion.tr
              key={promo.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="hover:bg-white/4 transition-colors border-b border-white/5 last:border-0"
            >
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden border border-white/5">
                    {promo.user.profile.avatar ? (
                      <img
                        src={promo.user.profile.avatar}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">
                        {promo.user.profile.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold italic uppercase tracking-tight">
                      @{promo.user.profile.username}
                    </p>
                    <p className="text-zinc-500 text-[9px] uppercase tracking-tighter">
                      {promo.user.email}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                    {promo.target?.media?.[0]?.url || promo.target?.url ? (
                      <img
                        src={promo.target?.media?.[0]?.url || promo.target?.url}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      <Sparkles size={16} className="text-zinc-700" />
                    )}
                  </div>
                  <div className="min-w-0 max-w-[120px]">
                    <span className="text-[9px] font-black uppercase tracking-widest text-brand-primary block mb-0.5">
                      {promo.targetType}
                    </span>
                    <p className="text-white text-[10px] truncate leading-tight">
                      {promo.target?.caption ||
                        promo.target?.text ||
                        'Sin descripción'}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-col">
                  <span className="text-white font-black text-sm tabular-nums">
                    {promo.budget} {promo.currency}
                  </span>
                  <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest">
                    Post Boost
                  </span>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-emerald-400" />
                  <span className="text-white font-black text-xs tabular-nums">
                    {promo.reach.toLocaleString()}
                  </span>
                </div>
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={promo.status} />
              </td>
              <td className="px-4 py-4">
                <div className="flex gap-2 items-center">
                  {promo.status === 'PENDING' && (
                    <>
                      <ActionButton
                        onClick={() =>
                          updateMutation.mutate({
                            id: promo.id,
                            status: 'ACTIVE',
                          })
                        }
                        label="Aprobar"
                        variant="success"
                        iconOnly
                        disabled={updateMutation.isPending}
                      />
                      <ActionButton
                        onClick={() => {
                          const reason = window.prompt('Motivo del rechazo:');
                          if (reason !== null) {
                            updateMutation.mutate({
                              id: promo.id,
                              status: 'REJECTED',
                              note: reason,
                            });
                          }
                        }}
                        label="Rechazar"
                        variant="danger"
                        iconOnly
                        disabled={updateMutation.isPending}
                      />
                    </>
                  )}
                  <a
                    href={`/post/${promo.targetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white transition-all"
                    title="Ver contenido"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </td>
            </motion.tr>
          ))}
        </Table>
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Insight Sidebar/Footer */}
      <div className="p-6 glass-panel rounded-3xl border border-brand-primary/10 bg-brand-primary/2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
            <Megaphone size={24} className="text-brand-primary" />
          </div>
          <div>
            <h4 className="text-white font-black text-xs uppercase tracking-widest">
              Cola de Promociones
            </h4>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-tighter italic">
              {data?.meta.total || 0} boost requests en el sistema
            </p>
          </div>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <span className="block text-white font-black text-lg tabular-nums">
              {data?.data.filter((p) => p.status === 'PENDING').length || 0}
            </span>
            <span className="block text-[9px] text-zinc-500 font-black uppercase tracking-widest">
              Pendientes
            </span>
          </div>
          <div className="text-right">
            <span className="block text-emerald-400 font-black text-lg tabular-nums">
              {data?.data.filter((p) => p.status === 'ACTIVE').length || 0}
            </span>
            <span className="block text-[9px] text-zinc-500 font-black uppercase tracking-widest">
              Activas
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
