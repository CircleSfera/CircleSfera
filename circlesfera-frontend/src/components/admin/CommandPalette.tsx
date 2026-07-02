import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, FileText, Search, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
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

  // Handle Cmd+K globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Trigger open is handled by parent, but parent listens to Cmd+K as well.
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { data: usersData } = useQuery({
    queryKey: ['adminSearchUsers', query],
    queryFn: () => adminApi.getUsers(1, 5, query).then((res) => res.data.data),
    enabled: isOpen && query.trim().length > 1,
  });

  if (!isOpen) return null;

  const handleSelect = (tab: string) => {
    navigate(`/admin/${tab}`);
    onClose();
  };

  const results = [
    // Static navigation shortcuts
    {
      id: 'nav-users',
      title: 'Ir a pestaña: Usuarios',
      icon: <User size={16} />,
      action: () => handleSelect('users'),
    },
    {
      id: 'nav-reports',
      title: 'Ir a pestaña: Reportes',
      icon: <AlertTriangle size={16} />,
      action: () => handleSelect('reports'),
    },
    {
      id: 'nav-posts',
      title: 'Ir a pestaña: Publicaciones',
      icon: <FileText size={16} />,
      action: () => handleSelect('posts'),
    },
    // Dynamic user search results
    ...(usersData || []).map((u) => ({
      id: `user-${u.id}`,
      title: `Usuario: @${u.profile?.username || 'sin_nombre'} (${u.profile?.fullName || u.email})`,
      icon: <User size={16} className="text-brand-primary" />,
      action: () => {
        navigate(`/admin/users?id=${u.id}`);
        onClose();
      },
    })),
  ].filter((r) => {
    if (!query) return r.id.startsWith('nav-');
    return r.title.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-100 flex items-start justify-center pt-[15vh]">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-lg bg-surface-elevated border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center px-4 py-3 border-b border-white/10">
            <Search size={20} className="text-gray-400 mr-3" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuarios, reportes, configuraciones..."
              className="flex-1 bg-transparent border-none text-white focus:ring-0 outline-none placeholder-gray-500 text-lg"
            />
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-xs font-bold text-gray-500 bg-white/5 rounded hover:bg-white/10 transition-colors"
            >
              ESC
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {query.length > 0 && results.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No se encontraron resultados para "{query}"
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((result) => (
                  <button
                    type="button"
                    key={result.id}
                    onClick={result.action}
                    className="w-full flex items-center px-3 py-3 rounded-xl hover:bg-brand-primary/10 hover:text-brand-primary text-gray-300 transition-colors group text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center mr-3 group-hover:bg-brand-primary/20 group-hover:text-brand-primary">
                      {result.icon}
                    </div>
                    <span className="font-medium text-sm">{result.title}</span>
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
