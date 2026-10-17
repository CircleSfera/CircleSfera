import { MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { usersApi } from '../../services/users.service';
import { countryOptions } from '../../utils/countries';

// The country the person says they are in. It decides which promotions they
// see; with none, the country of the network they signed up from is used.
export default function CountrySetting() {
  const { t, i18n } = useTranslation();
  const options = useMemo(() => countryOptions(i18n.language), [i18n.language]);
  const [country, setCountry] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    usersApi
      .getSettings()
      .then((response) => setCountry(response.data?.country ?? ''))
      .catch(() => undefined);
  }, []);

  const save = (next: string) => {
    const previous = country;
    setCountry(next);
    setSaving(true);
    usersApi
      .updateSettings({ country: next || null })
      .then(() => toast.success(t('settings.account.country_saved')))
      .catch(() => {
        setCountry(previous);
        toast.error(t('settings.account.country_failed'));
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <label
        htmlFor="settings-country"
        className="text-sm font-medium text-white flex items-center gap-2 mb-3"
      >
        <MapPin size={14} className="text-brand-primary-text" aria-hidden />
        {t('settings.account.country')}
      </label>
      <select
        id="settings-country"
        value={country}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        aria-describedby="settings-country-hint"
        className="w-full min-h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-white text-sm focus:outline-none focus:border-brand-primary disabled:opacity-60"
      >
        <option value="">{t('settings.account.country_network')}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
      <p
        id="settings-country-hint"
        className="mt-2 text-xs text-white/50 leading-relaxed"
      >
        {t('settings.account.country_hint')}
      </p>
    </div>
  );
}
