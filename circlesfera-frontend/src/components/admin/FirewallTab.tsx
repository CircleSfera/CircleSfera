import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminPageHeader } from './AdminPageHeader';
import FirewallRulesTab from './FirewallRulesTab';
import FirewallSignaturesTab from './FirewallSignaturesTab';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function FirewallTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<'rules' | 'signatures'>('rules');

  return (
    <div className="h-full flex flex-col gap-3 sm:gap-4">
      <AdminPageHeader
        title={t('admin.firewall.shell_title')}
        subtitle={t('admin.firewall.shell_subtitle')}
      />

      <div className="px-1 sm:px-2 border-b border-white/5 flex gap-1 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveView('rules')}
          className={`px-3 sm:px-4 min-h-11 sm:min-h-10 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeView === 'rules'
              ? 'border-brand-primary text-white'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          {t('admin.firewall.tab_rules')}
        </button>
        <button
          type="button"
          onClick={() => setActiveView('signatures')}
          className={`px-3 sm:px-4 min-h-11 sm:min-h-10 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeView === 'signatures'
              ? 'border-brand-primary text-white'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          {t('admin.firewall.tab_signatures')}
        </button>
      </div>

      <div className="flex-1 min-h-0 pt-1">
        {activeView === 'rules' ? (
          <FirewallRulesTab onToast={onToast} />
        ) : (
          <FirewallSignaturesTab onToast={onToast} />
        )}
      </div>
    </div>
  );
}
