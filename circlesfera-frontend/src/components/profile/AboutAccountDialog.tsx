import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  Calendar,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import UserAvatar from '../UserAvatar';
import { Dialog } from '../ui';

export type AboutAccountData = {
  username: string;
  fullName?: string;
  avatar?: string | null;
  joinedAt?: string | Date | null;
  emailConfirmed?: boolean;
  identityVerified?: boolean;
  accountType?: string | null;
  signupCountry?: string | null;
  strikeCount?: number;
  botLabeled?: boolean;
  lastActiveBucket?: 'today' | 'week' | 'month' | 'older' | 'unknown';
  accountStanding?: 'ok' | 'suspended';
  verificationLevel?: string | null;
};

/** Map `getMyProfile` / public profile payload → dialog props. */
export function aboutAccountFromProfile(
  profile:
    | {
        username?: string | null;
        fullName?: string | null;
        avatar?: string | null;
        joinedAt?: string | Date | null;
        emailConfirmed?: boolean;
        identityVerified?: boolean;
        identityVerifiedAt?: string | Date | null;
        accountType?: string | null;
        signupCountry?: string | null;
        strikeCount?: number;
        botLabeled?: boolean;
        lastActiveBucket?: AboutAccountData['lastActiveBucket'];
        accountStanding?: AboutAccountData['accountStanding'];
        verificationLevel?: string | null;
        user?: {
          createdAt?: string | Date | null;
          emailVerified?: string | Date | null;
        } | null;
      }
    | null
    | undefined,
): AboutAccountData | null {
  if (!profile?.username) return null;
  return {
    username: profile.username,
    fullName: profile.fullName ?? undefined,
    avatar: profile.avatar ?? undefined,
    joinedAt: profile.joinedAt ?? profile.user?.createdAt ?? null,
    emailConfirmed: profile.emailConfirmed ?? !!profile.user?.emailVerified,
    identityVerified: profile.identityVerified ?? !!profile.identityVerifiedAt,
    accountType: profile.accountType ?? null,
    signupCountry: profile.signupCountry ?? null,
    strikeCount: profile.strikeCount ?? 0,
    botLabeled: profile.botLabeled ?? false,
    lastActiveBucket: profile.lastActiveBucket,
    accountStanding: profile.accountStanding,
    verificationLevel: profile.verificationLevel ?? null,
  };
}

function formatJoined(
  joinedAt: string | Date | null | undefined,
  locale: string,
): string {
  if (!joinedAt) return '—';
  const d = new Date(joinedAt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export default function AboutAccountDialog({
  isOpen,
  onClose,
  account,
}: {
  isOpen: boolean;
  onClose: () => void;
  account: AboutAccountData;
}) {
  const { t, i18n } = useTranslation();

  const activityKey = account.lastActiveBucket || 'unknown';
  const activity = t(`profile.about.activity.${activityKey}`, {
    defaultValue: activityKey,
  });

  const rows: {
    icon: typeof Calendar;
    label: string;
    value: React.ReactNode;
  }[] = [
    {
      icon: Calendar,
      label: t('profile.about.joined', 'Joined'),
      value: formatJoined(account.joinedAt, i18n.language),
    },
    {
      icon: Mail,
      label: t('profile.about.email', 'Email confirmed'),
      value: account.emailConfirmed ? (
        <span className="text-brand-primary font-medium">
          {t('profile.about.yes', 'Yes')}
        </span>
      ) : (
        t('profile.about.no', 'No')
      ),
    },
    {
      icon: ShieldCheck,
      label: t('profile.about.identity', 'Identity verified'),
      value: account.identityVerified ? (
        <span className="text-brand-primary font-medium">
          {t('profile.about.yes', 'Yes')}
        </span>
      ) : (
        t('profile.about.no', 'No')
      ),
    },
    {
      icon: BadgeCheck,
      label: t('profile.about.account_type', 'Account type'),
      value: (
        <span className="capitalize">
          {(account.accountType || 'PERSONAL').toLowerCase()}
        </span>
      ),
    },
  ];

  if (account.signupCountry) {
    rows.push({
      icon: MapPin,
      label: t('profile.about.country', 'Country'),
      value: account.signupCountry,
    });
  }

  rows.push({
    icon: Activity,
    label: t('profile.about.activity_label', 'Recent activity'),
    value: activity,
  });

  rows.push({
    icon: AlertTriangle,
    label: t('profile.about.standing', 'Account status'),
    value:
      account.accountStanding === 'suspended' ? (
        <span className="text-brand-secondary font-medium">
          {t('profile.about.suspended', 'Suspended')}
        </span>
      ) : (
        <span className="text-brand-primary font-medium">
          {t('profile.about.in_good_standing', 'In good standing')}
        </span>
      ),
  });

  rows.push({
    icon: ShieldCheck,
    label: t('profile.about.strikes', 'Moderation strikes'),
    value:
      (account.strikeCount ?? 0) > 0 ? (
        <span className="text-brand-secondary font-medium">
          {String(account.strikeCount)}
        </span>
      ) : (
        String(account.strikeCount ?? 0)
      ),
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('profile.about.title', 'About this account')}
      maxWidth="sm"
    >
      <div className="space-y-5">
        {/* Profile header */}
        <div className="glass-panel rounded-xl border border-white/5 p-4 flex items-center gap-4">
          <UserAvatar
            src={account.avatar ?? undefined}
            alt={account.username}
            size="lg"
            className="w-14 h-14 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">
              {account.fullName || account.username}
            </p>
            <p className="text-xs text-white/50 mt-0.5 truncate">
              @{account.username}
            </p>
          </div>
        </div>

        {account.botLabeled && (
          <div className="flex items-start gap-3 rounded-xl border border-brand-accent/20 bg-brand-accent/5 p-4">
            <Bot
              className="size-4.5 text-brand-accent shrink-0 mt-0.5"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-accent">
                {t('profile.about.bot_label', 'Possibly automated')}
              </p>
              <p className="mt-1 text-xs text-white/50 leading-relaxed">
                {t(
                  'profile.about.bot_label_hint',
                  'Staff applied this label after review. The account owner can appeal in Settings.',
                )}
              </p>
            </div>
          </div>
        )}

        {/* Detail rows */}
        <ul className="glass-panel rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li
                key={row.label}
                className="flex items-center justify-between gap-3 px-4 py-3 min-h-11"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-white min-w-0">
                  <Icon
                    size={18}
                    className="text-white/50 shrink-0"
                    aria-hidden
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="text-sm text-white/70 text-right shrink-0">
                  {row.value}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-white/50 leading-relaxed text-center px-1">
          {t(
            'profile.about.identity_disclaimer',
            'Identity verified means government ID checked via Stripe Identity. It is separate from a paid plan badge.',
          )}
        </p>
      </div>
    </Dialog>
  );
}
