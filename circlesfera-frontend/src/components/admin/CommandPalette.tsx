import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Search, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services';
import { ADMIN_NAV_ITEMS, type AdminTab, findAdminNavItem } from './adminNav';
import { useFocusTrap } from './useFocusTrap';

const QUICK_ACTION_TABS: AdminTab[] = [
  'appeals',
  'reports',
  'moderation',
  'monetization',
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PaletteResult {
  id: string;
  title: string;
  icon: React.ReactNode;
  action: () => void;
  searchable: string;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useFocusTrap(isOpen, panelRef, { onEscape: onClose });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const { data: usersData } = useQuery({
    queryKey: ['adminSearchUsers', query],
    queryFn: () => adminApi.getUsers(1, 5, query).then((res) => res.data.data),
    enabled: isOpen && query.trim().length > 1,
  });

  const quickActionResults = useMemo(
    () =>
      QUICK_ACTION_TABS.map((tabId) => {
        const item = findAdminNavItem(tabId);
        if (!item) return null;
        return {
          id: `quick-${item.id}`,
          title: t('admin.cmd.quick_action', {
            section: t(item.labelKey, item.labelFallback),
          }),
          icon: <item.icon size={16} />,
          action: () => {
            navigate(`/admin/${item.id}`);
            onClose();
          },
          searchable: `${item.labelFallback} ${item.id} quick`,
        };
      }).filter(Boolean) as PaletteResult[],
    [navigate, onClose, t],
  );

  const navResults = useMemo(
    () =>
      ADMIN_NAV_ITEMS.filter(
        (item) => !QUICK_ACTION_TABS.includes(item.id),
      ).map((item) => ({
        id: `nav-${item.id}`,
        title: t('admin.cmd.go_to', {
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

  const userResults = useMemo(
    () =>
      (usersData || []).map((u) => ({
        id: `user-${u.id}`,
        title: t('admin.cmd.user_result', {
          username: u.profile?.username || t('admin.cmd.no_username'),
          name: u.profile?.fullName || u.email,
        }),
        icon: <User size={16} className="text-brand-primary" />,
        action: () => {
          navigate(`/admin/users?user=${encodeURIComponent(u.id)}`);
          onClose();
        },
        searchable: `${u.profile?.username || ''} ${u.email}`,
      })),
    [usersData, navigate, onClose, t],
  );

  const results = useMemo(() => {
    const all = [...quickActionResults, ...navResults, ...userResults];
    if (!query) {
      return all.filter(
        (r) => r.id.startsWith('quick-') || r.id.startsWith('nav-'),
      );
    }
    const q = query.toLowerCase();
    return all.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.searchable.toLowerCase().includes(q),
    );
  }, [query, quickActionResults, navResults, userResults]);

  // Reset keyboard highlight when the result set changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on query/result size change
  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  const runActive = useCallback(() => {
    const item = results[activeIndex];
    if (item) item.action();
  }, [results, activeIndex]);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runActive();
    }
  };

  if (!isOpen) return null;

  const activeId = results[activeIndex]?.id;

  return (
    <div className="fixed inset-0 z-100 flex items-start justify-center pt-[12vh] px-3">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label={t('common.close', 'Cerrar')}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('admin.search', 'Buscar')}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-[rgb(18,18,20)] border border-white/10 rounded-xl shadow-2xl overflow-hidden outline-none"
      >
        <div className="flex items-center px-4 py-3 border-b border-white/5">
          <Search size={20} className="text-gray-300 mr-3 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onListKeyDown}
            placeholder={t(
              'admin.cmd.placeholder',
              'Buscar secciones o usuarios...',
            )}
            className="flex-1 min-w-0 bg-transparent border-none text-white focus:ring-0 outline-none placeholder-gray-500 text-base"
            aria-autocomplete="list"
            aria-controls="admin-cmd-listbox"
            aria-activedescendant={activeId}
            role="combobox"
            aria-expanded={true}
          />
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs font-bold text-gray-500 bg-white/5 rounded hover:bg-white/10 transition-colors shrink-0"
          >
            ESC
          </button>
        </div>

        <div
          id="admin-cmd-listbox"
          role="listbox"
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {query.length > 0 && results.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              {t('admin.cmd.no_results', 'Sin resultados para "{{query}}"', {
                query,
              })}
            </div>
          ) : (
            <div className="space-y-0.5">
              {results.map((result, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  id={result.id}
                  key={result.id}
                  onClick={result.action}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={clsx(
                    'w-full flex items-center px-3 py-3 rounded-lg text-gray-300 text-left min-h-11',
                    index === activeIndex
                      ? 'bg-brand-primary/15 text-brand-primary'
                      : 'hover:bg-white/5',
                  )}
                >
                  <div
                    className={clsx(
                      'w-9 h-9 rounded-lg flex items-center justify-center mr-3 shrink-0',
                      index === activeIndex
                        ? 'bg-brand-primary/20'
                        : 'bg-white/5',
                    )}
                  >
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
      </div>
    </div>
  );
}
