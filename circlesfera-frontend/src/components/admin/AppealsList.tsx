import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  getAdminAppeals,
  updateAdminAppeal,
} from '../../services/appeals.service';
import { LoadingSpinner } from '../index';
import { ActionButton } from './AdminTable';

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
      toast.success('Apelación actualizada');
      queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] });
    },
    onError: () => {
      toast.error('Error al actualizar apelación');
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (appeals.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No hay apelaciones pendientes.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {appeals.map((appeal) => (
        <div
          key={appeal.id}
          className="p-4 bg-white/5 border border-white/10 rounded-lg"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <span className="text-xs font-bold uppercase text-brand-primary">
                {appeal.targetType}
              </span>
              <h4 className="text-sm font-bold text-white mt-1">
                Usuario: {appeal.user?.email}
              </h4>
            </div>
            <span
              className={`px-2 py-1 rounded text-xs font-bold ${
                appeal.status === 'PENDING'
                  ? 'bg-amber-500/10 text-amber-500'
                  : appeal.status === 'APPROVED'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
              }`}
            >
              {appeal.status}
            </span>
          </div>

          <p className="text-sm text-gray-300 mt-2 bg-black/20 p-3 rounded">
            {appeal.reason}
          </p>

          {appeal.status === 'PENDING' && (
            <div className="flex gap-2 mt-4">
              <ActionButton
                icon={CheckCircle}
                label="Aprobar"
                variant="success"
                onClick={() =>
                  updateMutation.mutate({ id: appeal.id, status: 'APPROVED' })
                }
                disabled={updateMutation.isPending}
              />
              <ActionButton
                icon={XCircle}
                label="Rechazar"
                variant="danger"
                onClick={() =>
                  updateMutation.mutate({ id: appeal.id, status: 'REJECTED' })
                }
                disabled={updateMutation.isPending}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
