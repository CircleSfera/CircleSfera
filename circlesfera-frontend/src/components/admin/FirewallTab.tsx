import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
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

      <AdminSegmentedControl
        value={activeView}
        onChange={(view) => setActiveView(view as typeof activeView)}
        options={[
          { value: 'rules', label: t('admin.firewall.tab_rules') },
          { value: 'signatures', label: t('admin.firewall.tab_signatures') },
        ]}
      />

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
