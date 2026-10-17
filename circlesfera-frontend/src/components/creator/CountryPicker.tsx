import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { countryName, countryOptions } from '../../utils/countries';

const fieldClass =
  'w-full min-h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-white text-sm focus:outline-none focus:border-brand-primary';

interface Props {
  id: string;
  value: string[];
  onChange: (countries: string[]) => void;
  describedBy?: string;
}

// The countries a promotion is aimed at, chosen from the closed list. None
// chosen reaches everywhere.
export default function CountryPicker({
  id,
  value,
  onChange,
  describedBy,
}: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const options = useMemo(() => countryOptions(language), [language]);
  const left = options.filter((o) => !value.includes(o.code));

  return (
    <div className="space-y-3">
      <select
        id={id}
        value=""
        aria-describedby={describedBy}
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
        className={fieldClass}
      >
        <option value="">{t('creator.promote.countries_add')}</option>
        {left.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((code) => {
            const name = countryName(code, language);
            return (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((c) => c !== code))}
                  aria-label={t('creator.promote.countries_remove', { name })}
                  className="min-h-11 inline-flex items-center gap-2 rounded-full bg-white/10 pl-4 pr-3 text-sm text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
                >
                  {name}
                  <X size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-white/70">
          {t('creator.promote.countries_everywhere')}
        </p>
      )}
    </div>
  );
}
