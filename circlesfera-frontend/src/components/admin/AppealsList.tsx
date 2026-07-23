import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';
import {
  getAdminAppeals,
  updateAdminAppeal,
} from '../../services/appeals.service';
import { LoadingSpinner } from '../index';
import { AdminListRow } from './AdminList';
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
    return <LoadingSpinner />;
  }

  if (appeals.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        No hay apelaciones pendientes.
      </div>
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
              className={`px-2 py-1 rounded text-xs font-semibold ${
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
            <span className="text-xs font-semibold uppercase text-brand-primary">
              {appeal.targetType}
            </span>
          }
          primaryAction={
            appeal.status === 'PENDING' ? (
              <div className="flex gap-2">
                <ActionButton
                  icon={CheckCircle}
                  label="Aprobar"
                  variant="success"
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
