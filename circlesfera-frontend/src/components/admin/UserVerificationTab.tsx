import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { type AdminUser, adminApi } from '../../services/admin.service';
import UserAvatar from '../UserAvatar';
import type { VerificationLevel } from '../VerificationBadge';
import VerificationBadge from '../VerificationBadge';

export default function UserVerificationTab() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users', searchTerm],
    queryFn: () => adminApi.getUsers(1, 50, searchTerm), // Assuming this exists or I'll create it
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
      }), // Assuming this exists or I'll create it
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const users = usersData?.data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <ShieldCheck className="text-brand-primary" />
            Gestión de Verificación
          </h2>
          <p className="text-gray-400 text-sm">
            Administra los niveles de confianza y roles de los creadores.
          </p>
        </div>

        <div className="relative group">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-brand-primary transition-colors"
            size={18}
          />
          <input
            type="text"
            placeholder="Buscar usuarios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary transition-all w-full md:w-64"
          />
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-white/5 text-[10px] uppercase tracking-widest font-black text-gray-500 border-b border-white/5">
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Nivel Actual</th>
                <th className="px-6 py-4">Tipo Cuenta</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                ['v1', 'v2', 'v3', 'v4', 'v5'].map((id) => (
                  <tr key={id} className="animate-pulse">
                    <td className="px-6 py-4" colSpan={4}>
                      <div className="h-10 bg-white/5 rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-gray-500 font-medium"
                  >
                    No se encontraron usuarios.
                  </td>
                </tr>
              ) : (
                (users as AdminUser[]).map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-white/2 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          src={user.profile?.avatar || undefined}
                          thumbnailUrl={user.profile?.thumbnailUrl || undefined}
                          standardUrl={user.profile?.standardUrl || undefined}
                          alt={user.profile?.username || 'User'}
                          size="sm"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                            {user.profile?.username}
                            <VerificationBadge
                              level={
                                user.verificationLevel as VerificationLevel
                              }
                              size={14}
                            />
                          </div>
                          <div className="text-[10px] text-gray-500 font-medium">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.verificationLevel || 'BASIC'}
                        onChange={(e) =>
                          updateVerificationMutation.mutate({
                            userId: user.id,
                            level:
                              (e.target.value as VerificationLevel) || 'BASIC',
                            accountType: user.accountType || 'PERSONAL',
                          })
                        }
                        className="bg-zinc-900 border border-white/10 rounded-lg text-xs font-bold py-1 px-2 text-white focus:outline-hidden focus:ring-1 focus:ring-brand-primary cursor-pointer hover:border-brand-primary/50 transition-colors"
                      >
                        <option value="BASIC">Standard</option>
                        <option value="VERIFIED">Verificado</option>
                        <option value="BUSINESS">Business</option>
                        <option value="ELITE">Elite Creator</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.accountType || 'PERSONAL'}
                        onChange={(e) =>
                          updateVerificationMutation.mutate({
                            userId: user.id,
                            level:
                              (user.verificationLevel as VerificationLevel) ||
                              'BASIC',
                            accountType: e.target.value,
                          })
                        }
                        className="bg-zinc-900 border border-white/10 rounded-lg text-xs font-bold py-1 px-2 text-white focus:outline-hidden focus:ring-1 focus:ring-brand-primary cursor-pointer hover:border-brand-primary/50 transition-colors"
                      >
                        <option value="PERSONAL">Personal</option>
                        <option value="CREATOR">Creador</option>
                        <option value="BUSINESS">Empresa</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
