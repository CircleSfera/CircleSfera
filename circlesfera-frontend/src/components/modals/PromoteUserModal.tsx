import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminUser } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface PromoteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (userId: string, role: string) => void;
  isLoading?: boolean;
}

const AVAILABLE_ROLES = ['MODERATOR', 'SUPPORT', 'FINANCE', 'ADMIN'];

export default function PromoteUserModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: PromoteUserModalProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('MODERATOR');

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSelectedUser(null);
      setSelectedRole('MODERATOR');
    }
  }, [isOpen]);

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'users', 'promote-search', debouncedSearch],
    queryFn: () =>
      adminApi
        .getUsers(1, 10, debouncedSearch, undefined, 'USER')
        .then((res) => res.data),
    enabled: isOpen && debouncedSearch.length > 2,
  });

  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="pt-2">
        <h2 className="text-xl font-bold text-white mb-2">Promover Usuario</h2>
        <p className="text-sm text-gray-400 mb-6">
          Busca a un usuario por su nombre o correo para añadirlo al equipo de
          administración.
        </p>

        {!selectedUser ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por usuario o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
              />
            </div>

            <div className="min-h-50 border border-white/5 rounded-xl bg-black/20 p-2 overflow-y-auto">
              {isFetching ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  Buscando...
                </div>
              ) : debouncedSearch.length <= 2 ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  Escribe al menos 3 letras para buscar.
                </div>
              ) : data?.data.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  No se encontraron usuarios estándar con ese término.
                </div>
              ) : (
                <div className="space-y-1">
                  {data?.data.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUser(user)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-left"
                    >
                      <UserAvatar
                        src={user.profile?.avatar}
                        alt={user.profile?.username || ''}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {user.profile?.fullName || user.profile?.username}
                        </div>
                        <div className="text-xs text-brand-primary truncate">
                          @{user.profile?.username}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 relative">
              <UserAvatar
                src={selectedUser.profile?.avatar}
                alt={selectedUser.profile?.username || ''}
                size="lg"
              />
              <div>
                <div className="text-base font-bold text-white">
                  {selectedUser.profile?.fullName ||
                    selectedUser.profile?.username}
                </div>
                <div className="text-sm text-brand-primary">
                  @{selectedUser.profile?.username}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="absolute top-2 right-2 text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10"
              >
                Cambiar
              </button>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="role-select"
                className="text-sm font-semibold text-gray-300"
              >
                Selecciona el nuevo rol
              </label>
              <select
                id="role-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-brand-primary transition-all"
              >
                {AVAILABLE_ROLES.map((r) => (
                  <option key={r} value={r} className="bg-[#0F1014] text-white">
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="mt-8 flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!selectedUser || isLoading}
            isLoading={isLoading}
            onClick={() => {
              if (selectedUser) onConfirm(selectedUser.id, selectedRole);
            }}
            className="gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Otorgar Permisos
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
