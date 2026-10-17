import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  type TeamInvitation,
  type TeamMember,
  type TeamRole,
  teamApi,
} from '../../services/team.service';
import { useAuthStore } from '../../stores/authStore';
import { apiErrorMessage, apiErrorStatus } from '../../utils/apiErrorMessage';
import UserAvatar from '../UserAvatar';
import { Button, Input, Select } from '../ui';
import SettingsSection from './SettingsSection';
import TeamActivity from './TeamActivity';

const ROLES: TeamRole[] = ['EDITOR', 'ADMINISTRATOR'];

// Team access to a Business Profile: the invitations waiting for the
// person, and the team of the Profile in use for its owner.
export default function TeamSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const accountType = useAuthStore((s) => s.profile?.accountType);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<TeamRole>('EDITOR');

  const invitations = useQuery({
    queryKey: ['teamInvitations'],
    queryFn: () => teamApi.invitations(),
  });

  const isBusiness = accountType === 'BUSINESS';
  const team = useQuery({
    queryKey: ['team'],
    queryFn: () => teamApi.get(),
    enabled: isBusiness,
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['team'] });
    queryClient.invalidateQueries({ queryKey: ['teamInvitations'] });
  };

  const invite = useMutation({
    mutationFn: () => teamApi.invite(username.trim(), role),
    onSuccess: () => {
      toast.success(t('settings.team.invited'));
      setUsername('');
      refresh();
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, t, 'settings.team.invite_error')),
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => teamApi.remove(memberId),
    onSuccess: refresh,
    onError: (err) =>
      toast.error(apiErrorMessage(err, t, 'settings.team.remove_error')),
  });

  const accept = useMutation({
    mutationFn: (id: string) => teamApi.accept(id),
    onSuccess: () => {
      toast.success(t('settings.team.accepted'));
      refresh();
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, t, 'settings.team.answer_error')),
  });

  const decline = useMutation({
    mutationFn: (id: string) => teamApi.decline(id),
    onSuccess: refresh,
    onError: (err) =>
      toast.error(apiErrorMessage(err, t, 'settings.team.answer_error')),
  });

  const pending = invitations.data ?? [];
  // Only the owner of the Profile sees its team.
  const ownsTeam = isBusiness && apiErrorStatus(team.error) !== 403;
  const data = team.data;
  const full = !!data && data.seats.used >= data.seats.max;

  const renderInvitation = (inv: TeamInvitation) => (
    <li
      key={inv.id}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/2 p-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          src={inv.profile.avatar || undefined}
          alt={inv.profile.username}
          size="md"
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            @{inv.profile.username}
          </p>
          <p className="text-xs text-white/50">
            {t('settings.team.invited_as', {
              role: t(`settings.team.role.${inv.role}`),
            })}
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          onClick={() => accept.mutate(inv.id)}
          isLoading={accept.isPending && accept.variables === inv.id}
          disabled={accept.isPending || decline.isPending}
          className="min-h-11 text-sm font-semibold px-4"
        >
          {t('settings.team.accept')}
        </Button>
        <Button
          variant="outline"
          onClick={() => decline.mutate(inv.id)}
          isLoading={decline.isPending && decline.variables === inv.id}
          disabled={accept.isPending || decline.isPending}
          className="min-h-11 text-sm font-semibold px-4"
        >
          {t('settings.team.decline')}
        </Button>
      </div>
    </li>
  );

  const renderMember = (member: TeamMember) => (
    <li
      key={member.id}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/2 p-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          src={member.person?.avatar || undefined}
          alt={member.person?.username || ''}
          size="md"
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            @{member.person?.username ?? t('settings.team.unknown')}
          </p>
          <p className="text-xs text-white/50">
            {t(`settings.team.role.${member.role}`)} ·{' '}
            {t(`settings.team.status.${member.status}`)}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        onClick={() => remove.mutate(member.id)}
        isLoading={remove.isPending && remove.variables === member.id}
        disabled={remove.isPending}
        className="min-h-11 text-sm font-semibold px-4 shrink-0"
      >
        {member.status === 'INVITED'
          ? t('settings.team.withdraw')
          : t('settings.team.remove')}
      </Button>
    </li>
  );

  return (
    <div className="max-w-xl space-y-5">
      {pending.length > 0 && (
        <SettingsSection
          title={t('settings.team.invitations_title')}
          description={t('settings.team.invitations_desc')}
          card={false}
        >
          <ul className="space-y-2">{pending.map(renderInvitation)}</ul>
        </SettingsSection>
      )}

      <SettingsSection
        title={t('settings.team.title')}
        description={t('settings.team.subtitle')}
        card={false}
      >
        {!isBusiness ? (
          <p className="text-sm text-white/60">
            {t('settings.team.business_only')}
          </p>
        ) : !ownsTeam ? (
          <p className="text-sm text-white/60">
            {t('settings.team.owner_only')}
          </p>
        ) : data && !data.available ? (
          <div className="space-y-3">
            <p className="text-sm text-white/60">
              {t('settings.team.plan_required')}
            </p>
            <Link
              to="/pricing"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-primary-text"
            >
              {t('settings.team.see_plans')}
            </Link>
          </div>
        ) : data ? (
          <div className="space-y-4">
            <p className="text-xs text-white/50">
              {t('settings.team.seats', {
                used: data.seats.used,
                max: data.seats.max,
              })}
            </p>
            {data.members.length > 0 ? (
              <ul className="space-y-2">{data.members.map(renderMember)}</ul>
            ) : (
              <p className="text-sm text-white/60">
                {t('settings.team.empty')}
              </p>
            )}
            <form
              className="rounded-xl border border-white/5 bg-white/2 p-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (username.trim() && !full) invite.mutate();
              }}
            >
              <h3 className="text-sm font-medium text-white">
                {t('settings.team.invite_title')}
              </h3>
              <Input
                label={t('settings.team.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('settings.team.username_placeholder')}
                maxLength={31}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <Select
                label={t('settings.team.role_label')}
                value={role}
                onChange={(e) => setRole(e.target.value as TeamRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`settings.team.role.${r}`)}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-white/50">
                {t(`settings.team.role_desc.${role}`)}
              </p>
              <p className="text-xs text-white/50">
                {t('settings.team.two_factor_note')}
              </p>
              <Button
                type="submit"
                isLoading={invite.isPending}
                disabled={!username.trim() || full || invite.isPending}
                className="min-h-11 button-alone text-sm font-semibold"
              >
                {full ? t('settings.team.full') : t('settings.team.invite')}
              </Button>
            </form>
          </div>
        ) : null}
      </SettingsSection>

      {/* The log stays readable after the plan ends. */}
      {ownsTeam && data && <TeamActivity />}
    </div>
  );
}
