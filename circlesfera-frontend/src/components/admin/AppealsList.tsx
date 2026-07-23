import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';
import {
  getAdminAppeals,
  updateAdminAppeal,
} from '../../services/appeals.service';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminListSkeleton } from './AdminSkeletons';
import { ActionButton } from './AdminTable';
import { adminToast } from './adminToast';

export default function AppealsList() {
  const queryClient = useQueryClient();

  const { data: appeals = [], isLoading } = useQuery({
    queryKey: ['admin', 'appeals'],
    queryFn: getAdminAppeals,
  });

  const updateMutation = useMutation({
    mutationFn: (params: {
      id: string;
      status: 'APPROVED' | 'REJECTED';
      adminNotes?: string;
    }) =>
      updateAdminAppeal(params.id, {
        status: params.status,
        adminNotes: params.adminNotes,
      }),
    onSuccess: () => {
      adminToast('Apelación actualizada', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] });
    },
    onError: () => {
      adminToast('Error al actualizar apelación', 'error');
    },
  });

  if (isLoading) {
    return <AdminListSkeleton rows={4} />;
  }

  if (appeals.length === 0) {
    return (
      <AdminEmptyState
        icon={CheckCircle}
        title="No hay apelaciones pendientes"
        description="La cola de apelaciones está vacía."
        compact
      />
    );
  }

  return (
    <div className="space-y-2">
      {appeals.map((appeal) => (
        <AdminListRow
          key={appeal.id}
          title={`Usuario: ${appeal.user?.email || '—'}`}
          subtitle={appeal.reason}
          badge={
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                appeal.status === 'PENDING'
                  ? 'bg-amber-500/10 text-amber-500'
                  : appeal.status === 'APPROVED'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
              }`}
            >
              {appeal.status}
            </span>
          }
          meta={
            <span className="text-xs font-medium uppercase text-brand-primary">
              {appeal.targetType}
            </span>
          }
          primaryAction={
            appeal.status === 'PENDING' ? (
              <div className="flex gap-1 sm:gap-2">
                <ActionButton
                  icon={CheckCircle}
                  label="Aprobar"
                  variant="success"
                  iconOnly
                  onClick={() =>
                    updateMutation.mutate({
                      id: appeal.id,
                      status: 'APPROVED',
                    })
                  }
                  disabled={updateMutation.isPending}
                />
                <ActionButton
                  icon={XCircle}
                  label="Rechazar"
                  variant="danger"
                  iconOnly
                  onClick={() =>
                    updateMutation.mutate({
                      id: appeal.id,
                      status: 'REJECTED',
                    })
                  }
                  disabled={updateMutation.isPending}
                />
              </div>
            ) : undefined
          }
        />
      ))}
    </div>
  );
}
