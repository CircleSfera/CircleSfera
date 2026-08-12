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
    <div className="h-full flex flex-col">
      <AdminPageHeader
        title={t('admin.firewall.shell_title')}
        subtitle={t('admin.firewall.shell_subtitle')}
      />

      <div className="px-4 md:px-6 py-2 border-b border-white/5 flex gap-4">
        <button
          type="button"
          onClick={() => setActiveView('rules')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
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
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeView === 'signatures'
              ? 'border-brand-primary text-white'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          {t('admin.firewall.tab_signatures')}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {activeView === 'rules' ? (
          <FirewallRulesTab onToast={onToast} />
        ) : (
          <FirewallSignaturesTab onToast={onToast} />
        )}
      </div>
    </div>
  );
}
