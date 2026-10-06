import { ChevronDown, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Dialog } from '../ui';
import OwnedProfileList from './OwnedProfileList';

// The own @username on the profile page: opens the list of the account's
// Profiles to switch between them.
export default function ProfileSwitcher({
  username,
  className = '',
}: {
  username: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('settings.profiles.switcher_open_a11y', { username })}
        className={`inline-flex items-center gap-1 min-h-11 -my-2 rounded-lg hover:text-white transition-colors ${className}`}
      >
        <span className="truncate">@{username}</span>
        <ChevronDown size={14} className="shrink-0" aria-hidden />
      </button>

      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t('settings.profiles.switcher_title')}
        maxWidth="sm"
        noPadding
      >
        <OwnedProfileList />
        <div className="border-t border-white/5">
          <Link
            to="/accounts/profiles"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 min-h-12 text-sm font-medium text-white/80 hover:bg-white/5 transition-colors"
          >
            <Settings2 size={18} className="text-white/50" aria-hidden />
            {t('settings.profiles.manage')}
          </Link>
        </div>
      </Dialog>
    </>
  );
}
