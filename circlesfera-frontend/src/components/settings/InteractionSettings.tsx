import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { type InteractionAudience, usersApi } from '../../services';
import { ErrorState } from '../ErrorEmptyStates';
import { Select, Switch } from '../ui';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

type Audience = InteractionAudience;

interface Choices {
  mentionsFrom: Audience;
  tagsFrom: Audience;
  manualTagApproval: boolean;
  messageRequests: boolean;
}

const OPEN: Choices = {
  mentionsFrom: 'EVERYONE',
  tagsFrom: 'EVERYONE',
  manualTagApproval: false,
  messageRequests: true,
};

const AUDIENCES: Audience[] = ['EVERYONE', 'FOLLOWING', 'NOBODY'];

/**
 * Who may mention, tag or send message requests to the active Profile, and
 * whether its tags wait for approval. Someone left out is never told.
 */
export default function InteractionSettings() {
  const { t } = useTranslation();
  const [choices, setChoices] = useState<Choices | null>(null);
  // Unread, the choices are never guessed: a guess could show a stricter
  // choice as open, and saving over it would loosen it.
  const settings = useQuery({
    queryKey: ['settings', 'interactions'],
    queryFn: () => usersApi.getSettings().then((res) => res.data ?? {}),
    // Read afresh each time: changes are saved one by one, not into this.
    gcTime: 0,
  });

  useEffect(() => {
    if (!settings.data) return;
    const s = settings.data as Partial<Choices>;
    setChoices({
      mentionsFrom: s.mentionsFrom ?? OPEN.mentionsFrom,
      tagsFrom: s.tagsFrom ?? OPEN.tagsFrom,
      manualTagApproval: s.manualTagApproval ?? OPEN.manualTagApproval,
      messageRequests: s.messageRequests ?? OPEN.messageRequests,
    });
  }, [settings.data]);
  const failed = settings.isError && choices === null;

  const change = <K extends keyof Choices>(key: K, value: Choices[K]) => {
    if (!choices) return;
    const before = choices[key];
    setChoices((c) => (c ? { ...c, [key]: value } : c));
    usersApi.updateSettings({ [key]: value }).catch(() => {
      // Only this choice goes back; others made meanwhile stay.
      setChoices((c) => (c ? { ...c, [key]: before } : c));
      toast.error(t('settings.interactions.save_error'));
    });
  };

  const ready = choices ?? OPEN;
  const loading = choices === null;

  const audienceSelect = (key: 'mentionsFrom' | 'tagsFrom', label: string) => (
    <Select
      aria-label={label}
      value={ready[key]}
      disabled={loading}
      onChange={(e) => change(key, e.target.value as Audience)}
      className="min-w-44"
    >
      {AUDIENCES.map((a) => (
        <option key={a} value={a}>
          {t(`settings.interactions.audience.${a}`)}
        </option>
      ))}
    </Select>
  );

  if (failed) {
    return (
      <SettingsSection
        title={t('settings.interactions.title')}
        description={t('settings.interactions.subtitle')}
      >
        <ErrorState
          message={t('settings.interactions.load_error')}
          onRetry={() => void settings.refetch()}
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title={t('settings.interactions.title')}
      description={t('settings.interactions.subtitle')}
    >
      <SettingsRow
        label={t('settings.interactions.mentions')}
        description={t('settings.interactions.mentions_desc')}
      >
        <div className="mt-2 max-w-xs">
          {audienceSelect('mentionsFrom', t('settings.interactions.mentions'))}
        </div>
      </SettingsRow>
      <SettingsRow
        label={t('settings.interactions.tags')}
        description={t('settings.interactions.tags_desc')}
      >
        <div className="mt-2 max-w-xs">
          {audienceSelect('tagsFrom', t('settings.interactions.tags'))}
        </div>
      </SettingsRow>
      <SettingsRow
        label={t('settings.interactions.manual_tags')}
        description={t('settings.interactions.manual_tags_desc')}
        control={
          <Switch
            checked={ready.manualTagApproval}
            disabled={loading}
            onChange={(e) => change('manualTagApproval', e.target.checked)}
            aria-label={t('settings.interactions.manual_tags')}
          />
        }
      >
        <Link
          to="/accounts/tags"
          className="mt-1 inline-block text-xs font-medium text-brand-primary-text hover:underline"
        >
          {t('settings.interactions.review_tags')}
        </Link>
      </SettingsRow>
      <SettingsRow
        label={t('settings.interactions.message_requests')}
        description={t('settings.interactions.message_requests_desc')}
        control={
          <Switch
            checked={ready.messageRequests}
            disabled={loading}
            onChange={(e) => change('messageRequests', e.target.checked)}
            aria-label={t('settings.interactions.message_requests')}
          />
        }
      />
    </SettingsSection>
  );
}
