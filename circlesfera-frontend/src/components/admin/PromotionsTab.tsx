import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  ExternalLink,
  Ghost,
  Megaphone,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { LoadingSpinner } from '../index';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSplitView } from './AdminSplitView';
import {
  FilterDropdown,
  Pagination,
  SearchInput,
  StatusBadge,
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
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();

  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminPromotion>>({
    queryKey: ['admin', 'promotions', page, debouncedSearch, statusFilter],
    queryFn: () =>
      adminApi
        .getPromotions(
          page,
          20,
          statusFilter || undefined,
          debouncedSearch || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminPromotion>),
  });

  const promos = data?.data || [];
  const selectedPromo = promos.find((p) => p.id === selectedPromoId);

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

      // Auto-advance
      if (
        selectedPromoId &&
        (variables.status === 'ACTIVE' || variables.status === 'REJECTED')
      ) {
        const currentIndex = promos.findIndex((p) => p.id === selectedPromoId);
        if (currentIndex !== -1 && currentIndex + 1 < promos.length) {
          setSelectedPromoId(promos[currentIndex + 1].id);
        } else {
          setSelectedPromoId(null);
        }
      }

      const msg =
        variables.status === 'ACTIVE'
          ? 'Promoción aprobada'
          : 'Promoción rechazada';
      onToast(msg, 'success');
    },
    onError: () => onToast('Error al actualizar promoción', 'error'),
  });

  return (
    <div className="flex flex-col min-h-0 space-y-4">
      <AdminPageHeader
        title="Cola de Promociones"
        subtitle="Solicitudes de anuncios y posts patrocinados"
      />

      <AdminFilterBar>
        <SearchInput
          value={search}
          onChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          placeholder="Buscar usuario..."
        />
        <FilterDropdown
          label="Estado"
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: 'Todos' },
            { value: 'PENDING', label: 'Pendientes' },
            { value: 'ACTIVE', label: 'Activas' },
            { value: 'COMPLETED', label: 'Completadas' },
            { value: 'REJECTED', label: 'Rechazadas' },
          ]}
        />
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedPromoId}
        onBack={() => setSelectedPromoId(null)}
        listTitle={`Solicitudes (${data?.meta.total || 0})`}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="p-3 border-b border-white/5 shrink-0 flex justify-between items-center lg:hidden">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Target size={16} className="text-brand-primary" />
                Solicitudes ({data?.meta.total || 0})
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <LoadingSpinner />
                </div>
              ) : promos.length === 0 ? (
                <AdminEmptyState
                  icon={Megaphone}
                  title="No hay promociones encontradas"
                  description="Intenta ajustar los filtros de búsqueda"
                  compact
                />
              ) : (
                promos.map((promo) => (
                  <AdminListRow
                    key={promo.id}
                    onClick={() => setSelectedPromoId(promo.id)}
                    className={
                      selectedPromoId === promo.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={`@${promo.user.profile.username}`}
                    subtitle={`${promo.budget} ${promo.currency} · ${promo.reach.toLocaleString()} alcance est.`}
                    badge={<StatusBadge status={promo.status} />}
                    avatar={
                      <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0">
                        {promo.target?.media?.[0]?.url || promo.target?.url ? (
                          <img
                            src={
                              promo.target?.media?.[0]?.thumbnailUrl ||
                              promo.target?.media?.[0]?.url ||
                              promo.target?.url
                            }
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700">
                            <Ghost size={16} />
                          </div>
                        )}
                      </div>
                    }
                  />
                ))
              )}
            </div>

            <div className="p-2 border-t border-white/5 shrink-0">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          <AnimatePresence mode="wait">
            {selectedPromo ? (
              <motion.div
                key={selectedPromo.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0 gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      src={selectedPromo.user.profile.avatar || undefined}
                      alt={selectedPromo.user.profile.username}
                      size="sm"
                    />
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        @{selectedPromo.user.profile.username}
                      </h3>
                      <p className="text-xs text-gray-300">
                        {selectedPromo.user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedPromo.status === 'PENDING' && (
                      <>
                        <Button
                          onClick={() => {
                            const reason = window.prompt(
                              'Motivo del rechazo (opcional):',
                            );
                            if (reason !== null) {
                              updateMutation.mutate({
                                id: selectedPromo.id,
                                status: 'REJECTED',
                                note: reason,
                              });
                            }
                          }}
                          isLoading={updateMutation.isPending}
                          variant="danger"
                          className="min-h-11 px-3 md:px-4 py-2 text-sm font-semibold border-red-500/20"
                        >
                          <XCircle size={16} className="mr-2 hidden md:block" />{' '}
                          <span className="hidden md:inline">Rechazar</span>
                          <XCircle size={16} className="md:hidden" />
                        </Button>
                        <Button
                          onClick={() =>
                            updateMutation.mutate({
                              id: selectedPromo.id,
                              status: 'ACTIVE',
                            })
                          }
                          isLoading={updateMutation.isPending}
                          variant="success"
                          className="min-h-11 px-3 md:px-4 py-2 text-sm font-semibold border-green-500/20"
                        >
                          <CheckCircle
                            size={16}
                            className="mr-2 hidden md:block"
                          />{' '}
                          <span className="hidden md:inline">Aprobar</span>
                          <CheckCircle size={16} className="md:hidden" />
                        </Button>
                      </>
                    )}
                    <a
                      href={`/post/${selectedPromo.targetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                      title="Abrir en nueva pestaña"
                    >
                      <ExternalLink size={18} />
                    </a>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
                  <div className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-lg p-4 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 divide-x divide-white/5">
                    <div className="px-2">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">
                        Presupuesto
                      </p>
                      <p className="text-lg font-semibold text-white">
                        {selectedPromo.budget}{' '}
                        <span className="text-sm text-gray-300">
                          {selectedPromo.currency}
                        </span>
                      </p>
                    </div>
                    <div className="px-4">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">
                        Alcance Est.
                      </p>
                      <p className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                        <TrendingUp size={16} />
                        {selectedPromo.reach.toLocaleString()}
                      </p>
                    </div>
                    <div className="px-4">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">
                        Fecha Inicio
                      </p>
                      <p className="text-sm font-bold text-white">
                        {new Date(selectedPromo.startDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="px-4">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">
                        Estado
                      </p>
                      <StatusBadge status={selectedPromo.status} />
                    </div>
                  </div>

                  <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl">
                    <div className="p-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
                        {selectedPromo.targetType} Promocionado
                      </span>
                    </div>

                    {selectedPromo.target?.media &&
                      selectedPromo.target.media.length > 0 && (
                        <div className="relative aspect-4/5 bg-black">
                          {selectedPromo.target.media[0].type?.includes(
                            'video',
                          ) ? (
                            <video
                              src={selectedPromo.target.media[0].url}
                              className="w-full h-full object-cover"
                              controls
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={selectedPromo.target.media[0].url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                          {selectedPromo.target.media.length > 1 && (
                            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md">
                              1/{selectedPromo.target.media.length}
                            </div>
                          )}
                        </div>
                      )}

                    <div className="p-4">
                      {selectedPromo.target?.caption ||
                      selectedPromo.target?.text ? (
                        <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">
                          {selectedPromo.target.caption ||
                            selectedPromo.target.text}
                        </p>
                      ) : (
                        <p className="text-gray-500 text-sm italic">
                          Sin descripción
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <AdminEmptyState
                  icon={Megaphone}
                  title="Selecciona una promoción"
                  description="Para revisar los detalles y aprobar la campaña"
                />
              </div>
            )}
          </AnimatePresence>
        }
      />
    </div>
  );
}
