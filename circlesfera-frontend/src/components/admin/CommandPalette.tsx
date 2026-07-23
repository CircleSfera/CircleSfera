import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services';
import { ADMIN_NAV_ITEMS } from './adminNav';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { data: usersData } = useQuery({
    queryKey: ['adminSearchUsers', query],
    queryFn: () => adminApi.getUsers(1, 5, query).then((res) => res.data.data),
    enabled: isOpen && query.trim().length > 1,
  });

  const navResults = useMemo(
    () =>
      ADMIN_NAV_ITEMS.map((item) => ({
        id: `nav-${item.id}`,
        title: t('admin.cmd.go_to', 'Ir a: {{section}}', {
          section: t(item.labelKey, item.labelFallback),
        }),
        icon: <item.icon size={16} />,
        action: () => {
          navigate(`/admin/${item.id}`);
          onClose();
        },
        searchable: `${item.labelFallback} ${item.id}`,
      })),
    [navigate, onClose, t],
  );

  if (!isOpen) return null;

  const userResults = (usersData || []).map((u) => ({
    id: `user-${u.id}`,
    title: `Usuario: @${u.profile?.username || 'sin_nombre'} (${u.profile?.fullName || u.email})`,
    icon: <User size={16} className="text-brand-primary" />,
    action: () => {
      navigate(`/admin/users?id=${u.id}`);
      onClose();
    },
    searchable: `${u.profile?.username || ''} ${u.email}`,
  }));

  const results = [...navResults, ...userResults].filter((r) => {
    if (!query) return r.id.startsWith('nav-');
    const q = query.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.searchable.toLowerCase().includes(q)
    );
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-100 flex items-start justify-center pt-[12vh] px-3">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-lg bg-surface-elevated border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center px-4 py-3 border-b border-white/10">
            <Search size={20} className="text-gray-300 mr-3 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(
                'admin.cmd.placeholder',
                'Buscar secciones o usuarios...',
              )}
              className="flex-1 min-w-0 bg-transparent border-none text-white focus:ring-0 outline-none placeholder-gray-500 text-base"
            />
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-xs font-bold text-gray-500 bg-white/5 rounded hover:bg-white/10 transition-colors shrink-0"
            >
              ESC
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {query.length > 0 && results.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {t('admin.cmd.no_results', 'Sin resultados para "{{query}}"', {
                  query,
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((result) => (
                  <button
                    type="button"
                    key={result.id}
                    onClick={result.action}
                    className="w-full flex items-center px-3 py-3 rounded-xl hover:bg-brand-primary/10 hover:text-brand-primary text-gray-300 transition-colors group text-left min-h-11"
                  >
                    <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center mr-3 group-hover:bg-brand-primary/20 group-hover:text-brand-primary shrink-0">
                      {result.icon}
                    </div>
                    <span className="font-medium text-sm truncate">
                      {result.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
