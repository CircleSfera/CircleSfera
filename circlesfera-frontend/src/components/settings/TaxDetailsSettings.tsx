import { Capacitor } from '@capacitor/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { countryName } from '../../utils/countries';
import { LoadingSpinner } from '../LoadingStates';
import { Dialog } from '../ui/Dialog';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

// The provider's script comes only with a panel, when one is opened.
const TaxDetailsPanels = lazy(() => import('./TaxDetailsPanels'));

const STATUS_KEY = ['monetization', 'tax-status'];

type Panel = 'settings' | 'registrations';

/**
 * The tax details of the active Profile's own payout account, as rows of
 * the settings: where it is based, and where it is registered for VAT. Each
 * row opens the provider's panel for it in a dialog; the page itself shows
 * nothing of the provider.
 */
export default function TaxDetailsSettings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Panel | null>(null);
  // The provider's panels do not run inside the phone apps.
  const native = Capacitor.isNativePlatform();

  const { data, isLoading, isError } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: monetizationApi.getTaxDetailsStatus,
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: STATUS_KEY });
  };
  const close = () => {
    setOpen(null);
    refresh();
  };

  const place = (code: string | null) =>
    code ? countryName(code, i18n.language) : null;
  const pending = isLoading
    ? t('settings.monetization.tax.reading')
    : isError
      ? t('settings.monetization.tax.unreadable')
      : null;
  const address =
    pending ??
    (data?.headOffice
      ? [data.headOffice.city, place(data.headOffice.country)]
          .filter(Boolean)
          .join(', ')
      : t('settings.monetization.tax.address_none'));
  const registrations =
    pending ??
    (data?.registrationCountries.length
      ? data.registrationCountries.map((code) => place(code)).join(', ')
      : t('settings.monetization.tax.registrations_none'));

  const action = (label: string) =>
    native ? undefined : (
      <span className="flex items-center gap-1 text-sm font-medium text-brand-primary-text">
        {label}
        <ChevronRight size={16} className="text-white/30" aria-hidden />
      </span>
    );
  const rowClass = native ? '' : 'hover:bg-white/5 transition-colors';

  return (
    <>
      <SettingsSection
        title={t('settings.monetization.tax.title')}
        description={t('settings.monetization.tax.desc')}
      >
        <SettingsRow
          label={t('settings.monetization.tax.address')}
          description={address}
          control={action(
            data?.headOffice
              ? t('settings.monetization.tax.edit')
              : t('settings.monetization.tax.add'),
          )}
          onClick={native ? undefined : () => setOpen('settings')}
          className={rowClass}
        />
        <SettingsRow
          label={t('settings.monetization.tax.registrations')}
          description={registrations}
          control={action(t('settings.monetization.tax.manage'))}
          onClick={native ? undefined : () => setOpen('registrations')}
          className={rowClass}
        />
        {native ? (
          <p className="px-4 py-3 text-xs text-white/50 leading-relaxed">
            {t('settings.monetization.tax.on_web')}
          </p>
        ) : null}
      </SettingsSection>

      <Dialog
        isOpen={open !== null}
        onClose={close}
        title={
          open === 'registrations'
            ? t('settings.monetization.tax.registrations')
            : t('settings.monetization.tax.address')
        }
        maxWidth="lg"
        noPadding
      >
        {/* One solid surface, the colour the panel is drawn on. */}
        <div className="bg-surface-elevated p-4 rounded-b-xl min-h-40">
          {open ? (
            <Suspense
              fallback={
                <div className="flex justify-center py-8">
                  <LoadingSpinner size="sm" />
                </div>
              }
            >
              <TaxDetailsPanels panel={open} onChange={refresh} />
            </Suspense>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
