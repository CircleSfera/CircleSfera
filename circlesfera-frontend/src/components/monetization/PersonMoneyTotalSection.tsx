import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { formatCents } from '../../utils/money';
import {
  CreatorFigure,
  CreatorFigures,
  CreatorRow,
  CreatorSection,
} from '../creator/CreatorPieces';
import UserAvatar from '../UserAvatar';

// What the person has earned over all their Profiles, each Profile with its
// own figures. Shown once the person has more than one Profile, or income
// recorded before it named its Profile; otherwise it would repeat the
// figures above.
export default function PersonMoneyTotalSection() {
  const { t, i18n } = useTranslation();
  const { data: total } = useQuery({
    queryKey: ['monetization-person-total'],
    queryFn: monetizationApi.getPersonTotal,
  });

  if (
    !total ||
    (total.profiles.length < 2 && total.unassignedEarningsCents === 0)
  ) {
    return null;
  }

  const money = (cents: number) => formatCents(cents, i18n.language);

  return (
    <CreatorSection
      title={t('creator.income.all_profiles.title')}
      hint={t('creator.income.all_profiles.hint')}
    >
      <div className="space-y-4">
        <CreatorFigures>
          <CreatorFigure
            label={t('creator.income.all_profiles.earned')}
            value={money(total.totalEarningsCents)}
          />
          <CreatorFigure
            label={t('creator.income.all_profiles.this_month')}
            value={money(total.currentMonthEarningsCents)}
          />
        </CreatorFigures>
        <div className="space-y-2">
          {total.profiles.map((profile) => (
            <CreatorRow
              key={profile.profileId}
              media={
                <UserAvatar
                  src={profile.avatar}
                  alt={profile.username}
                  size="full"
                />
              }
              title={`@${profile.username}`}
              facts={[
                t('creator.income.all_profiles.month_line', {
                  amount: money(profile.currentMonthEarningsCents),
                }),
                profile.ownPayoutAccount
                  ? t('creator.income.all_profiles.own_account')
                  : t('creator.income.all_profiles.shared_account'),
              ]}
              badge={
                <span className="shrink-0 text-sm font-medium tabular-nums text-white">
                  {money(profile.earningsCents)}
                </span>
              }
            />
          ))}
          {total.unassignedEarningsCents > 0 ? (
            <CreatorRow
              title={t('creator.income.all_profiles.earlier')}
              facts={[
                t('creator.income.all_profiles.month_line', {
                  amount: money(total.unassignedCurrentMonthEarningsCents),
                }),
                t('creator.income.all_profiles.earlier_hint'),
              ]}
              badge={
                <span className="shrink-0 text-sm font-medium tabular-nums text-white">
                  {money(total.unassignedEarningsCents)}
                </span>
              }
            />
          ) : null}
        </div>
      </div>
    </CreatorSection>
  );
}
