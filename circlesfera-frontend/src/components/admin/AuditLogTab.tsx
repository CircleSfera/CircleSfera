import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useState } from 'react';
import type { AuditLogEntry } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { Pagination, Table } from './AdminTable';

const ACTION_LABELS: Record<string, string> = {
  ban_user: 'Baneó usuario',
  unban_user: 'Desbaneó usuario',
  delete_post: 'Eliminó publicación',
  delete_user: 'Eliminó cuenta',
  promote_user: 'Promovió a admin',
  demote_user: 'Degradó de admin',
  resolved_report: 'Resolvió reporte',
  dismissed_report: 'Descartó reporte',
  delete_comment: 'Eliminó comentario',
  delete_story: 'Eliminó historia',
};

const ACTION_COLORS: Record<string, string> = {
  ban_user: 'text-red-400',
  unban_user: 'text-green-400',
  delete_post: 'text-red-400',
  delete_user: 'text-red-500',
  promote_user: 'text-yellow-400',
  demote_user: 'text-gray-300',
  resolved_report: 'text-green-400',
  dismissed_report: 'text-gray-300',
  delete_comment: 'text-red-400',
  delete_story: 'text-red-400',
};

export default function AuditLogTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse<AuditLogEntry>>({
    queryKey: ['admin', 'audit-logs', page],
    queryFn: () => adminApi.getAuditLogs(page, 15).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Registro de Auditoría"
        subtitle="Historial completo de acciones administrativas"
      />

      <div className="rounded-xl border border-white/10 overflow-x-auto">
        <AdminList
          loading={isLoading}
          isEmpty={!data?.data?.length}
          emptyIcon={Activity}
          emptyTitle="No hay registros de auditoría"
          emptyDescription="No se encontraron acciones registradas."
          mobile={
            <div className="space-y-2">
              {data?.data?.map((log) => (
                <AdminListRow
                  key={log.id}
                  title={
                    <span
                      className={`inline-flex items-center gap-1.5 ${ACTION_COLORS[log.action] || 'text-gray-300'}`}
                    >
                      <Activity size={14} />
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  }
                  subtitle={
                    <span className="text-brand-primary font-semibold">
                      @{log.adminUsername}
                    </span>
                  }
                  badge={
                    <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/10">
                      {log.targetType}
                    </span>
                  }
                  meta={<span>{new Date(log.createdAt).toLocaleString()}</span>}
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={['Fecha', 'Admin', 'Acción', 'Tipo', 'Target ID']}
              columnWidths={[
                'whitespace-nowrap',
                'min-w-28',
                'min-w-36',
                'whitespace-nowrap',
                'min-w-32',
              ]}
              loading={false}
              isEmpty={false}
            >
              {data?.data?.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-3 py-2.5 text-gray-300 text-sm whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-brand-primary font-semibold text-sm truncate block max-w-32">
                      @{log.adminUsername}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Activity
                        size={14}
                        className={`shrink-0 ${ACTION_COLORS[log.action] || 'text-gray-300'}`}
                      />
                      <span
                        className={`text-sm font-medium truncate ${ACTION_COLORS[log.action] || 'text-gray-300'}`}
                        title={ACTION_LABELS[log.action] || log.action}
                      >
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/10">
                      {log.targetType}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5 text-gray-600 text-xs font-mono max-w-40 truncate"
                    title={log.targetId}
                  >
                    {log.targetId}
                  </td>
                </tr>
              ))}
            </Table>
          }
        />
        <div className="p-2 border-t border-white/5">
          <Pagination meta={data?.meta} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
