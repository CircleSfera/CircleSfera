import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { countryName } from '../../utils/countries';
import { Dialog } from '../ui/Dialog';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  countries: string[];
}

// Why a promoted post is shown: who paid for it and where it is aimed. The
// country is the only rule; nothing about the viewer's interests or activity.
export default function WhyPromotedDialog({
  isOpen,
  onClose,
  username,
  countries,
}: Props) {
  const { t, i18n } = useTranslation();
  const names = countries.map((code) => countryName(code, i18n.language));
  const list = new Intl.ListFormat(i18n.language, {
    style: 'long',
    type: 'conjunction',
  }).format(names);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={t('post.why.title')}>
      <div className="space-y-3 text-sm text-white/80 leading-relaxed">
        <p>{t('post.why.paid_by', { username })}</p>
        <p>
          {names.length > 0
            ? t('post.why.countries', { list })
            : t('post.why.everywhere')}
        </p>
        <p>{t('post.why.nothing_else')}</p>
        <p className="text-white/60">
          {t('post.why.your_country')}{' '}
          <Link
            to="/accounts/account"
            onClick={onClose}
            className="text-brand-primary-text underline underline-offset-2"
          >
            {t('post.why.change_country')}
          </Link>
        </p>
      </div>
    </Dialog>
  );
}
