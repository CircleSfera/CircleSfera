import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight, Info, Search, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { profileApi } from '../../services';
import { paymentsApi } from '../../services/payments.service';
import AboutAccountDialog, {
  aboutAccountFromProfile,
} from '../profile/AboutAccountDialog';
import UserAvatar from '../UserAvatar';
import { SETTINGS_NAV_GROUPS, type SettingsNavItem } from './settingsNav';

export default function SettingsHubIndex() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [showAbout, setShowAbout] = useState(false);

  const { data: profileData } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => profileApi.getMyProfile(),
  });
  const profile = profileData?.data;
  const aboutAccount = aboutAccountFromProfile(profile);

  const { data: billingStatus } = useQuery({
    queryKey: ['billingStatus'],
    queryFn: () => paymentsApi.getBillingStatus(),
    retry: false,
  });

  const planName =
    billingStatus?.subscription?.planName || t('settings.billing.free', 'Free');
  const isPrivate = !!(
    profile?.isPrivate || profile?.user?.settings?.privacyLevel === 'PRIVATE'
  );

  const aboutLabel = t('settings.hub.about', 'About this account');
  const showAboutRow = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    const hint = t(
      'settings.hub.about_hint',
      'Joined date, verification, and account status',
    ).toLowerCase();
    return aboutLabel.toLowerCase().includes(q) || hint.includes(q);
  }, [filter, aboutLabel, t]);

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return SETTINGS_NAV_GROUPS;
    return SETTINGS_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const label = t(item.labelKey, item.labelFallback).toLowerCase();
        return label.includes(q) || item.id.includes(q);
      }),
    })).filter((g) => g.items.length > 0);
  }, [filter, t]);

  return (
    <div className="max-w-xl space-y-5">
      {aboutAccount ? (
        <AboutAccountDialog
          isOpen={showAbout}
          onClose={() => setShowAbout(false)}
          account={aboutAccount}
        />
      ) : null}

      <div className="glass-panel rounded-xl border border-white/5 p-4 flex items-center gap-4">
        <UserAvatar
          src={profile?.avatar || undefined}
          thumbnailUrl={profile?.thumbnailUrl}
          standardUrl={profile?.standardUrl}
          alt={profile?.username || ''}
          size="lg"
          className="w-14 h-14 rounded-full object-cover shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">
            @{profile?.username || '…'}
          </p>
          {profile?.fullName ? (
            <p className="text-xs text-white/50 truncate">{profile.fullName}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <ChipLink
              to="/accounts/billing"
              label={t('settings.hub.plan_a11y', {
                plan: planName,
                defaultValue: `Subscription: ${planName}`,
              })}
            />
            {profile?.identityVerifiedAt ? (
              <Chip icon={<BadgeCheck size={12} />}>
                {t('settings.hub.verified', 'Verified')}
              </Chip>
            ) : null}
            <ChipLink
              to="/accounts/privacy"
              icon={<Shield size={12} />}
              label={t('settings.hub.privacy_a11y', {
                visibility: isPrivate
                  ? t('settings.hub.private', 'Private')
                  : t('settings.hub.public', 'Public'),
                defaultValue: `Privacy: ${
                  isPrivate
                    ? t('settings.hub.private', 'Private')
                    : t('settings.hub.public', 'Public')
                }`,
              })}
            />
          </div>
        </div>
        <Link
          to="/accounts/profile"
          className="text-sm font-medium text-brand-primary hover:underline shrink-0 min-h-11 inline-flex items-center"
        >
          {t('settings.hub.edit_profile', 'Edit')}
        </Link>
      </div>

      {showAboutRow && aboutAccount ? (
        <ul className="glass-panel rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          <li>
            <button
              type="button"
              onClick={() => setShowAbout(true)}
              className="flex items-center gap-3 px-4 py-3 min-h-11 w-full text-left hover:bg-white/5 transition-colors"
            >
              <Info size={18} className="text-white/50 shrink-0" aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white truncate">
                  {aboutLabel}
                </span>
                <span className="block text-xs text-white/50 mt-0.5 truncate">
                  {t(
                    'settings.hub.about_hint',
                    'Joined date, verification, and account status',
                  )}
                </span>
              </span>
              <ChevronRight
                size={16}
                className="text-white/30 shrink-0"
                aria-hidden
              />
            </button>
          </li>
        </ul>
      ) : null}

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          size={16}
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('settings.hub.filter', 'Filter settings…')}
          aria-label={t('settings.hub.filter', 'Filter settings…')}
          className="w-full min-h-11 bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
        />
      </div>

      <div className="space-y-5">
        {filteredGroups.map((group) => (
          <section key={group.id}>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-2 px-1">
              {t(group.labelKey, group.labelFallback)}
            </h2>
            <ul className="glass-panel rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
              {group.items.map((item) => (
                <HubNavRow key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))}
        {filteredGroups.length === 0 && !showAboutRow && (
          <p className="text-sm text-white/50 text-center py-8">
            {t('settings.hub.no_results', 'No matching settings')}
          </p>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-white/70">
      {icon}
      {children}
    </span>
  );
}

function ChipLink({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
    >
      {icon}
      {label}
    </Link>
  );
}

function HubNavRow({ item }: { item: SettingsNavItem }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={`/accounts/${item.id}`}
        className="flex items-center gap-3 px-4 py-3 min-h-11 hover:bg-white/5 transition-colors"
      >
        <Icon size={18} className="text-white/50 shrink-0" aria-hidden />
        <span className="flex-1 text-sm font-medium text-white truncate">
          {t(item.labelKey, item.labelFallback)}
        </span>
        <ChevronRight
          size={16}
          className="text-white/30 shrink-0"
          aria-hidden
        />
      </Link>
    </li>
  );
}
