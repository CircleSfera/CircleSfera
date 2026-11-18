import { CREATOR_CATEGORIES } from '@circlesfera/shared';
import { useTranslation } from 'react-i18next';

interface Props {
  category: string;
  onCategoryChange: (category: string) => void;
}

/** The kind of creator a Creator Profile says it is, from a closed list. */
export default function CreatorCategoryField({
  category,
  onCategoryChange,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-white/60">
        {t('settings.profile.creator.hint')}
      </p>
      <div className="space-y-1.5">
        <label
          htmlFor="creatorCategory"
          className="block text-xs font-bold text-gray-400/80 uppercase tracking-widest mb-1 px-0.5"
        >
          {t('settings.profile.creator.category')}
        </label>
        <select
          id="creatorCategory"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
        >
          <option value="">{t('settings.profile.creator.no_category')}</option>
          {CREATOR_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {t(`profile.creator.categories.${key}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
