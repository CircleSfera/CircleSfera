import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldCheck,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { adminApi } from '../../services/admin.service';
import ConfirmModal from '../modals/ConfirmModal';
import UserAvatar from '../UserAvatar';
import { Button, Select } from '../ui';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { Pagination, SearchInput } from './AdminTable';

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = Math.max(0, now - d);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

export default function UserVerificationTab({
  onToast,
}: {
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users', page, searchTerm],
    queryFn: () => adminApi.getUsers(page, 20, searchTerm),
  });

  const updateVerificationMutation = useMutation({
    mutationFn: ({
      userId,
      level,
      accountType,
    }: {
      userId: string;
      level: VerificationLevel;
      accountType: string;
    }) =>
      adminApi.updateUserStatus(userId, {
        verificationLevel: level,
        accountType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onToast('Perfil actualizado correctamente', 'success');
    },
    onError: () => onToast('Error al actualizar perfil', 'error'),
  });

  const revokeKycMutation = useMutation({
    mutationFn: (userId: string) => adminApi.revokeUserKYC(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onToast('Verificación KYC revocada', 'success');
    },
    onError: () => onToast('Error al revocar KYC', 'error'),
  });

  const syncKycMutation = useMutation({
    mutationFn: (userId: string) => adminApi.syncUserKYC(userId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      const status = res.data?.status;
      if (status === 'verified' || status === 'already_verified') {
        onToast('KYC sincronizado: identidad verificada', 'success');
      } else {
        onToast(`KYC sincronizado: ${status || 'ok'}`, 'success');
      }
    },
    onError: () => onToast('Error al sincronizar KYC con Stripe', 'error'),
  });

  const users = usersData?.data?.data || [];
  const selectedUser = users.find((u) => u.id === selectedUserId);

  // Local state for the right pane form
  const [draftLevel, setDraftLevel] = useState<VerificationLevel | null>(null);
  const [draftType, setDraftType] = useState<string | null>(null);

  // Reset drafts when selection changes
  if (selectedUser && draftLevel === null && draftType === null) {
    setDraftLevel(
      (selectedUser.verificationLevel as VerificationLevel) || 'BASIC',
    );
    setDraftType(selectedUser.accountType || 'PERSONAL');
  } else if (!selectedUser && draftLevel !== null) {
    setDraftLevel(null);
    setDraftType(null);
  }

  const hasChanges =
    selectedUser &&
    (draftLevel !== selectedUser.verificationLevel ||
      draftType !== selectedUser.accountType);

  const handleSave = () => {
    if (!selectedUser || !draftLevel || !draftType) return;
    updateVerificationMutation.mutate({
      userId: selectedUser.id,
      level: draftLevel,
      accountType: draftType,
    });
  };

  const handleSelectUser = (user: (typeof users)[number]) => {
    setSelectedUserId(user.id);
    setDraftLevel((user.verificationLevel as VerificationLevel) || 'BASIC');
    setDraftType(user.accountType || 'PERSONAL');
  };

  return (
    <div className="flex flex-col min-h-0 space-y-4">
      <AdminPageHeader
        title="KYC & Verificación"
        subtitle="Estado de Stripe Identity y niveles de cuenta de los creadores."
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={searchTerm}
            onChange={(v) => {
              setSearchTerm(v);
              setPage(1);
            }}
            placeholder="Buscar usuarios..."
          />
        </div>
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedUserId}
        onBack={() => setSelectedUserId(null)}
        listTitle="Cola de Usuarios"
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {isLoading ? (
                <AdminListSkeleton rows={5} />
              ) : users.length === 0 ? (
                <AdminEmptyState
                  icon={UserX}
                  title="No se encontraron usuarios"
                  description="Intenta ajustar los filtros de búsqueda."
                  compact
                />
              ) : (
                users.map((user) => {
                  const isVerified = !!user.identityVerifiedAt;
                  const isPending =
                    !isVerified && !!user.stripeIdentitySessionId;

                  return (
                    <AdminListRow
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className={
                        selectedUserId === user.id
                          ? 'border-brand-primary/30 bg-brand-primary/10'
                          : undefined
                      }
                      title={
                        <span className="flex items-center gap-1">
                          @{user.profile?.username || 'Desconocido'}
                          <VerificationBadge
                            level={user.verificationLevel as VerificationLevel}
                            size={14}
                          />
                        </span>
                      }
                      subtitle={
                        <span className="uppercase tracking-wide">
                          {user.accountType}
                        </span>
                      }
                      badge={
                        <span
                          className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            isVerified
                              ? 'text-green-400 bg-green-400/10'
                              : isPending
                                ? 'text-yellow-400 bg-yellow-400/10'
                                : 'text-zinc-400 bg-zinc-400/10'
                          }`}
                        >
                          {isVerified
                            ? 'KYC Completado'
                            : isPending
                              ? 'KYC en Proceso'
                              : 'KYC No Iniciado'}
                        </span>
                      }
                      meta={timeAgo(user.createdAt)}
                      avatar={
                        <UserAvatar
                          src={user.profile?.avatar || undefined}
                          thumbnailUrl={user.profile?.thumbnailUrl || undefined}
                          standardUrl={user.profile?.standardUrl || undefined}
                          alt={user.profile?.username || 'User'}
                          size="sm"
                        />
                      }
                    />
                  );
                })
              )}
            </div>

            <div className="p-2 border-t border-white/5 shrink-0">
              <Pagination meta={usersData?.data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          <AnimatePresence mode="wait">
            {selectedUser ? (
              <motion.div
                key={selectedUser.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                {/* Header Action Bar */}
                <div className="p-4 border-b border-white/5 bg-white/2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      src={selectedUser.profile?.avatar || undefined}
                      thumbnailUrl={
                        selectedUser.profile?.thumbnailUrl || undefined
                      }
                      standardUrl={
                        selectedUser.profile?.standardUrl || undefined
                      }
                      alt={selectedUser.profile?.username || 'User'}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                        <span className="truncate">
                          @{selectedUser.profile?.username}
                        </span>
                        <VerificationBadge
                          level={
                            selectedUser.verificationLevel as VerificationLevel
                          }
                          size={18}
                        />
                      </h3>
                      <p className="text-xs text-gray-400 truncate">
                        ID: {selectedUser.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {hasChanges && (
                      <Button
                        onClick={handleSave}
                        isLoading={updateVerificationMutation.isPending}
                        variant="primary"
                        className="text-sm font-semibold shadow-lg shadow-brand-primary/20 min-h-11 w-full sm:w-auto"
                      >
                        <Check size={16} className="mr-2" /> Guardar Cambios
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
                  {/* Stripe Identity KYC Status Card */}
                  <div>
                    <h4 className="text-white font-semibold text-sm uppercase tracking-wide mb-3">
                      Estado de Stripe Identity (KYC)
                    </h4>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {selectedUser.identityVerifiedAt ? (
                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-3">
                            <CheckCircle2 size={24} />
                          </div>
                          <h5 className="text-green-400 font-semibold text-base mb-1">
                            Identidad Verificada
                          </h5>
                          <p className="text-xs text-gray-300">
                            Stripe confirmó la identidad de este usuario el{' '}
                            {new Date(
                              selectedUser.identityVerifiedAt,
                            ).toLocaleDateString()}
                            .
                          </p>
                        </div>
                      ) : selectedUser.stripeIdentitySessionId ? (
                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 bg-yellow-500/20 text-yellow-400 rounded-full flex items-center justify-center mb-3">
                            <Clock size={24} />
                          </div>
                          <h5 className="text-yellow-400 font-semibold text-base mb-1">
                            Sesión Creada (Pendiente)
                          </h5>
                          <p className="text-xs text-gray-300">
                            El usuario ha iniciado el proceso pero aún no lo ha
                            completado o está bajo revisión en Stripe.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 bg-white/10 text-gray-300 rounded-full flex items-center justify-center mb-3">
                            <UserX size={24} />
                          </div>
                          <h5 className="text-gray-300 font-semibold text-base mb-1">
                            No Iniciado
                          </h5>
                          <p className="text-xs text-gray-500">
                            El usuario aún no ha requerido pasar por el proceso
                            de verificación KYC.
                          </p>
                        </div>
                      )}

                      <div className="p-4 bg-white/2 border border-white/5 rounded-lg flex flex-col justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Session ID
                          </p>
                          <p className="text-white text-xs font-mono break-all bg-black/50 p-2 rounded-lg border border-white/10">
                            {selectedUser.stripeIdentitySessionId || 'N/A'}
                          </p>
                        </div>

                        {selectedUser.stripeIdentitySessionId &&
                          !selectedUser.identityVerifiedAt && (
                            <Button
                              onClick={() =>
                                syncKycMutation.mutate(selectedUser.id)
                              }
                              isLoading={syncKycMutation.isPending}
                              variant="secondary"
                              className="w-full text-sm font-semibold mt-4 min-h-11"
                            >
                              <RefreshCw size={16} className="mr-2" />{' '}
                              Sincronizar desde Stripe
                            </Button>
                          )}

                        {(selectedUser.identityVerifiedAt ||
                          selectedUser.stripeIdentitySessionId) && (
                          <div className="mt-4">
                            <Button
                              onClick={() => setConfirmRevokeOpen(true)}
                              isLoading={revokeKycMutation.isPending}
                              variant="danger"
                              className="w-full text-sm font-semibold border-red-500/30 min-h-11"
                            >
                              <RefreshCw size={16} className="mr-2" /> Revocar
                              Verificación y Forzar KYC
                            </Button>
                            <p className="text-xs text-gray-500 text-center mt-2">
                              Esto borrará el registro de validación y la sesión
                              actual.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Profile Level Controls */}
                  <div>
                    <h4 className="text-white font-semibold text-sm uppercase tracking-wide mb-3">
                      Control de Nivel y Permisos
                    </h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="p-3 sm:p-4 bg-white/2 rounded-xl border border-white/5 space-y-2">
                        <Select
                          label="Nivel de Verificación de Perfil"
                          value={draftLevel || 'BASIC'}
                          onChange={(e) =>
                            setDraftLevel(e.target.value as VerificationLevel)
                          }
                        >
                          <option value="BASIC">Standard</option>
                          <option value="VERIFIED">
                            Verificado (Blue Check)
                          </option>
                          <option value="BUSINESS">
                            Business (Gold Check)
                          </option>
                          <option value="ELITE">
                            Elite Creator (Red Check)
                          </option>
                        </Select>
                        <p className="text-xs text-gray-500 mt-2">
                          Define el distintivo (badge) público que se muestra en
                          el perfil del usuario.
                        </p>
                      </div>

                      <div className="p-3 sm:p-4 bg-white/2 rounded-xl border border-white/5 space-y-2">
                        <Select
                          label="Tipo de Cuenta"
                          value={draftType || 'PERSONAL'}
                          onChange={(e) => setDraftType(e.target.value)}
                        >
                          <option value="PERSONAL">Cuenta Personal</option>
                          <option value="CREATOR">Cuenta de Creador</option>
                          <option value="BUSINESS">Cuenta de Empresa</option>
                        </Select>
                        <p className="text-xs text-gray-500 mt-2">
                          Define las herramientas (analytics, monetización) a
                          las que tiene acceso el usuario.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-center justify-center p-6"
              >
                <AdminEmptyState
                  icon={ShieldCheck}
                  title="Selecciona un usuario de la cola"
                  description="Para revisar su estado de KYC y niveles"
                />
              </motion.div>
            )}
          </AnimatePresence>
        }
      />

      <ConfirmModal
        isOpen={confirmRevokeOpen}
        onClose={() => setConfirmRevokeOpen(false)}
        onConfirm={() => {
          if (selectedUser) {
            revokeKycMutation.mutate(selectedUser.id);
          }
          setConfirmRevokeOpen(false);
        }}
        title="¿Revocar verificación KYC?"
        message="¿Estás seguro de que quieres revocar el KYC de este usuario? Tendrá que volver a verificar su identidad con Stripe."
        confirmText="Revocar"
        cancelText="Cancelar"
        isDestructive={true}
      />
    </div>
  );
}
