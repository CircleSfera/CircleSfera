import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Check,
  ChevronUp,
  CreditCard,
  DollarSign,
  FileText,
  Flag,
  Key,
  Scale,
  Shield,
  Star,
  User,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SettingsTabId =
  | 'profile'
  | 'privacy'
  | 'notifications'
  | 'security'
  | 'billing'
  | 'monetization'
  | 'requests'
  | 'referrals'
  | 'close_friends'
  | 'mutes'
  | 'appeals'
  | 'reports'
  | 'account';

interface TabItem {
  id: SettingsTabId;
  label: string;
  icon: React.ElementType;
}

interface SettingsMobileNavProps {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
}

export default function SettingsMobileNav({
  activeTab,
  onSelectTab,
}: SettingsMobileNavProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const tabs: TabItem[] = [
    {
      id: 'profile',
      label: t('settings.tabs.profile.label', 'Perfil'),
      icon: User,
    },
    {
      id: 'security',
      label: t('settings.tabs.security.label', 'Seguridad'),
      icon: Key,
    },
    {
      id: 'privacy',
      label: t('settings.tabs.privacy.label', 'Privacidad'),
      icon: Shield,
    },
    {
      id: 'monetization',
      label: 'Monetización',
      icon: DollarSign,
    },
    {
      id: 'billing',
      label: t('settings.tabs.billing.label', 'Facturación & Planes'),
      icon: CreditCard,
    },
    {
      id: 'notifications',
      label: t('settings.tabs.notifications.label', 'Notificaciones'),
      icon: Bell,
    },
    {
      id: 'requests',
      label: t('settings.tabs.requests.label', 'Solicitudes'),
      icon: UserPlus,
    },
    {
      id: 'close_friends',
      label: t('settings.tabs.close_friends.label', 'Mejores Amigos'),
      icon: Star,
    },
    {
      id: 'mutes',
      label: t('settings.tabs.mutes.label', 'Bloqueados & Silenciados'),
      icon: UserX,
    },
    {
      id: 'referrals',
      label: 'Invitaciones Beta',
      icon: Users,
    },
    {
      id: 'appeals',
      label: t('settings.tabs.appeals.label', 'Apelaciones'),
      icon: Scale,
    },
    {
      id: 'reports',
      label: t('settings.tabs.reports.label', 'Mis reportes'),
      icon: Flag,
    },
    {
      id: 'account',
      label: t('settings.tabs.account.label', 'Cuenta & Datos'),
      icon: FileText,
    },
  ];

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];
  const Icon = currentTab.icon;

  return (
    <>
      {/* Mobile Sticky Dropdown Trigger */}
      <div className="md:hidden sticky top-16 z-30 mb-6 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-2xl">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-brand-primary/20 text-brand-primary border border-brand-primary/30 shrink-0">
              <Icon size={20} />
            </div>
            <div className="text-left truncate">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block">
                {t('settings.mobile_section', 'Sección Actual')}
              </span>
              <span className="text-sm font-bold text-white truncate block">
                {currentTab.label}
              </span>
            </div>
          </div>
          <ChevronUp
            size={20}
            className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Mobile Drawer Backdrop and Sheet */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 md:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-white/15 rounded-t-3xl p-6 shadow-2xl md:hidden max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-black text-white tracking-tight">
                    {t('settings.mobile_title', 'Ajustes y Configuración')}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t(
                      'settings.mobile_subtitle',
                      'Selecciona una sección para gestionar',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {tabs.map((tab) => {
                  const TabIcon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        onSelectTab(tab.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all ${
                        isActive
                          ? 'bg-brand-primary/20 border border-brand-primary/40 text-white font-bold shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                          : 'bg-white/5 border border-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-xl ${
                            isActive
                              ? 'bg-brand-primary text-white'
                              : 'bg-white/5 text-gray-400'
                          }`}
                        >
                          <TabIcon size={18} />
                        </div>
                        <span className="text-sm font-semibold">
                          {tab.label}
                        </span>
                      </div>
                      {isActive && (
                        <Check size={18} className="text-brand-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
