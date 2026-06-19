import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useState } from 'react';
import type { AuditLogEntry } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
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
  demote_user: 'text-gray-400',
  resolved_report: 'text-green-400',
  dismissed_report: 'text-gray-400',
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
      <div className="glass-panel rounded-lg overflow-clip border border-white/10">
        <Table
          headers={['Fecha', 'Admin', 'Acción', 'Tipo', 'Target ID']}
          loading={isLoading}
          isEmpty={!data?.data?.length}
        >
          {data?.data?.map((log) => (
            <tr
              key={log.id}
              className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
            >
              <td className="px-2 py-1 text-gray-400 text-sm whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString()}
              </td>
              <td className="px-2 py-1">
                <span className="text-brand-primary font-bold text-sm">
                  @{log.adminUsername}
                </span>
              </td>
              <td className="px-2 py-1">
                <div className="flex items-center gap-2">
                  <Activity
                    size={14}
                    className={ACTION_COLORS[log.action] || 'text-gray-400'}
                  />
                  <span
                    className={`text-sm font-medium ${ACTION_COLORS[log.action] || 'text-gray-400'}`}
                  >
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                </div>
              </td>
              <td className="px-2 py-1">
                <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-black uppercase tracking-wider text-gray-400 border border-white/10">
                  {log.targetType}
                </span>
              </td>
              <td className="px-2 py-1 text-gray-600 text-xs font-mono">
                {log.targetId.slice(0, 12)}...
              </td>
            </tr>
          ))}
        </Table>
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
