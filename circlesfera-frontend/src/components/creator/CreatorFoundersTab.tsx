import {
  FOUNDING_CREATOR_CITY_MAX_LENGTH,
  FOUNDING_CREATOR_CITY_MIN_LENGTH,
  FOUNDING_CREATOR_LINK_MAX_LENGTH,
  FOUNDING_CREATOR_LINKS_MAX,
  FOUNDING_CREATOR_NOTE_MAX_LENGTH,
} from '@circlesfera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Clock, Plus, Sparkles, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  type FoundingCreatorApplication,
  type FoundingCreatorView,
  type FreeYearState,
  foundingCreatorsApi,
} from '../../services/foundingCreators.service';
import { usersApi } from '../../services/users.service';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { formatDay } from '../../utils/format';
import { Button, Card, Input, Textarea } from '../ui';
import CreatorEmpty from './CreatorEmpty';
import { CreatorSection } from './CreatorPieces';

const QUERY_KEY = ['founding-creators'];

// A day written out ("25 de noviembre de 2027"), as the provider counts it.
function longDay(value: string, language: string): string {
  return new Date(value).toLocaleDateString(language, {
    dateStyle: 'long',
    timeZone: 'UTC',
  });
}

// A web address with http or https, as the server accepts.
export function isWebLink(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > FOUNDING_CREATOR_LINK_MAX_LENGTH) return false;
  try {
    const url = new URL(text);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname.includes('.')
    );
  } catch {
    return false;
  }
}

/**
 * Founding creators (BD-034): before the open launch, a Creator Profile
 * applies with links to its work, its city and a note. Staff decide; an
 * approved Profile gets the Verified plan free for twelve months. This page
 * is where the person sees where they stand: CircleSfera sends them nothing.
 */
export default function CreatorFoundersTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => foundingCreatorsApi.status(),
  });

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="founders-loading">
        <div className="h-8 w-48 rounded-md bg-white/5 animate-pulse" />
        <div className="h-52 rounded-xl bg-white/5 animate-pulse border border-white/5" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <CreatorEmpty
        title={t('creator.founders.error')}
        action={{
          label: t('creator.founders.retry'),
          onClick: () => void refetch(),
        }}
      />
    );
  }
  if (!data.isOwner || !data.isCreator) {
    return (
      <CreatorEmpty
        icon={Sparkles}
        title={t('creator.founders.creators_only_title')}
        message={t('creator.founders.creators_only')}
      />
    );
  }

  const application = data.application;
  const canApply = !application || application.status === 'DECLINED';

  return (
    <div className="space-y-8 pb-8">
      <Intro />
      {/* On a phone one column; on a wide screen what the person does
          beside what they get. */}
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="space-y-8">
          {application?.status === 'DECLINED' ? (
            <Declined application={application} />
          ) : null}
          {application && !canApply ? (
            <ApplicationState view={data} application={application} />
          ) : (
            <ApplyForm />
          )}
        </div>
        <Benefits />
      </div>
    </div>
  );
}

// The page's own title is the section's, in the creator area's header.
function Intro() {
  const { t } = useTranslation();
  return (
    <section>
      <p className="text-xs font-medium text-brand-primary-text">
        {t('creator.founders.eyebrow')}
      </p>
      <p className="mt-2 max-w-2xl text-sm text-white/70 leading-relaxed">
        {t('creator.founders.intro')}
      </p>
    </section>
  );
}

function Benefits() {
  const { t } = useTranslation();
  const items = ['badge', 'no_card', 'end'] as const;
  return (
    <CreatorSection title={t('creator.founders.benefits_title')}>
      <Card variant="glass" className="p-4">
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-white/80">
              <BadgeCheck
                size={18}
                className="mt-0.5 shrink-0 text-brand-primary-text"
                aria-hidden
              />
              <span className="leading-relaxed">
                {t(`creator.founders.benefits.${item}`)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </CreatorSection>
  );
}

function SentDetails({
  application,
}: {
  application: FoundingCreatorApplication;
}) {
  const { t, i18n } = useTranslation();
  return (
    <dl className="mt-4 space-y-3 text-sm">
      <div>
        <dt className="text-xs text-white/50">{t('creator.founders.links')}</dt>
        <dd className="mt-1 space-y-1">
          {application.links.map((link) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block truncate text-brand-primary-text underline-offset-2 hover:underline"
            >
              {link}
            </a>
          ))}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-white/50">{t('creator.founders.city')}</dt>
        <dd className="mt-1 text-white">{application.city}</dd>
      </div>
      <div>
        <dt className="text-xs text-white/50">{t('creator.founders.sent')}</dt>
        <dd className="mt-1 text-white">
          {formatDay(application.createdAt, i18n.language)}
        </dd>
      </div>
    </dl>
  );
}

function ApplicationState({
  view,
  application,
}: {
  view: FoundingCreatorView;
  application: FoundingCreatorApplication;
}) {
  const { t } = useTranslation();
  if (application.status === 'PENDING') {
    return (
      <CreatorSection title={t('creator.founders.state_title')}>
        <Card variant="glass" className="p-4" data-testid="founders-pending">
          <div className="flex items-start gap-3">
            <Clock
              size={20}
              className="mt-0.5 shrink-0 text-white/60"
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold text-white">
                {t('creator.founders.pending_title')}
              </p>
              <p className="mt-1 text-sm text-white/60 leading-relaxed">
                {t('creator.founders.pending')}
              </p>
            </div>
          </div>
          <SentDetails application={application} />
        </Card>
      </CreatorSection>
    );
  }
  return (
    <CreatorSection title={t('creator.founders.state_title')}>
      <Card variant="glass" className="p-4" data-testid="founders-approved">
        <div className="flex items-start gap-3">
          <Sparkles
            size={20}
            className="mt-0.5 shrink-0 text-brand-primary-text"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              {t('creator.founders.approved_title')}
            </p>
            <FreeYear view={view} application={application} />
          </div>
        </div>
      </Card>
    </CreatorSection>
  );
}

function FreeYear({
  view,
  application,
}: {
  view: FoundingCreatorView;
  application: FoundingCreatorApplication;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: () => foundingCreatorsApi.startFreeYear(),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      queryClient.invalidateQueries({ queryKey: ['billingStatus'] });
      toast.success(t('creator.founders.started'));
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, t, 'creator.founders.start_failed')),
  });
  const verify = useMutation({
    mutationFn: () => usersApi.createIdentitySession(window.location.href),
    onSuccess: (res: { url?: string }) => {
      if (res.url) window.location.href = res.url;
    },
    onError: () => toast.error(t('creator.founders.verify_failed')),
  });

  const state: FreeYearState | null = view.freeYear;
  const plan = application.platformSubscription;
  if (state === 'STARTED' && plan) {
    const until = longDay(plan.currentPeriodEnd, i18n.language);
    const free = plan.status === 'TRIALING';
    // What happens at the end: it continues with a saved card; it ends when
    // cancelled, or when no VAT can be worked out for the address.
    const after =
      application.freeYearTaxable === false
        ? t('creator.founders.ends_no_address', { date: until })
        : plan.cancelAtPeriodEnd
          ? t('creator.founders.ends_cancelled', { date: until })
          : t('creator.founders.after_year');
    return (
      <div className="mt-1 space-y-3">
        <p className="text-sm text-white/70 leading-relaxed">
          {free
            ? t('creator.founders.free_until', { date: until })
            : t('creator.founders.free_over')}
        </p>
        {free ? (
          <p
            className="text-xs text-white/50 leading-relaxed"
            data-testid="founders-after-year"
          >
            {after}
          </p>
        ) : null}
        <Link
          to="/accounts/billing"
          className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          {t('creator.founders.see_billing')}
        </Link>
      </div>
    );
  }
  if (state === 'NEEDS_IDENTITY') {
    return (
      <div className="mt-1 space-y-3">
        <p className="text-sm text-white/70 leading-relaxed">
          {t('creator.founders.needs_identity')}
        </p>
        <Button
          variant="primary"
          size="lg"
          className="min-h-12"
          isLoading={verify.isPending}
          onClick={() => verify.mutate()}
        >
          {t('creator.founders.verify')}
        </Button>
      </div>
    );
  }
  if (state === 'HAS_PLAN') {
    return (
      <p className="mt-1 text-sm text-white/70 leading-relaxed">
        {t('creator.founders.has_plan')}
      </p>
    );
  }
  // The terms the person accepts by starting the year (owner's wording,
  // BD-034, 2026-11-25): the button sends the acceptance.
  return (
    <section
      className="mt-2 space-y-3"
      aria-labelledby="free-year-terms"
      data-testid="founders-terms"
    >
      <h3 id="free-year-terms" className="text-base font-semibold text-white">
        {t('creator.founders.terms_title')}
      </h3>
      <p className="text-sm text-white/80 leading-relaxed">
        {t('creator.founders.terms_year', {
          date: view.freeYearEndsAt
            ? longDay(view.freeYearEndsAt, i18n.language)
            : '',
        })}
      </p>
      <p className="text-sm text-white/70 leading-relaxed">
        {t('creator.founders.terms_after')}
      </p>
      <Button
        variant="primary"
        size="lg"
        className="min-h-12"
        isLoading={start.isPending}
        onClick={() => start.mutate()}
      >
        {t('creator.founders.start')}
      </Button>
    </section>
  );
}

function Declined({
  application,
}: {
  application: FoundingCreatorApplication;
}) {
  const { t } = useTranslation();
  return (
    <CreatorSection title={t('creator.founders.state_title')}>
      <Card variant="glass" className="p-4" data-testid="founders-declined">
        <p className="text-sm font-semibold text-white">
          {t('creator.founders.declined_title')}
        </p>
        <p className="mt-1 text-sm text-white/70 leading-relaxed">
          {t(
            `creator.founders.reasons.${application.declineReason ?? 'OTHER'}`,
          )}
        </p>
        {application.declineNote ? (
          <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-white/80 leading-relaxed break-words">
            {application.declineNote}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-white/50">
          {t('creator.founders.apply_again')}
        </p>
      </Card>
    </CreatorSection>
  );
}

function ApplyForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [links, setLinks] = useState<string[]>(['']);
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const filled = links.map((link) => link.trim()).filter(Boolean);
  const badLink = links.some((link) => link.trim() && !isWebLink(link));
  const cityOk =
    city.trim().length >= FOUNDING_CREATOR_CITY_MIN_LENGTH &&
    city.trim().length <= FOUNDING_CREATOR_CITY_MAX_LENGTH;
  const valid = filled.length > 0 && !badLink && cityOk;

  const apply = useMutation({
    mutationFn: () =>
      foundingCreatorsApi.apply({
        links: filled,
        city: city.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      toast.success(t('creator.founders.sent_done'));
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, t, 'creator.founders.send_failed')),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (valid) apply.mutate();
  };

  return (
    <CreatorSection
      title={t('creator.founders.form_title')}
      hint={t('creator.founders.form_hint')}
    >
      <Card variant="glass" className="p-4">
        <form className="space-y-5" onSubmit={submit} noValidate>
          <fieldset className="space-y-3">
            <legend className="mb-1 px-0.5 text-xs font-bold uppercase tracking-widest text-gray-400/80">
              {t('creator.founders.links')}
            </legend>
            {links.map((link, index) => (
              <div
                // The rows are only added at the end or removed.
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id
                key={index}
                className="flex items-start gap-2"
              >
                <div className="min-w-0 grow">
                  <Input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    aria-label={t('creator.founders.link_label', {
                      number: index + 1,
                    })}
                    placeholder="https://"
                    value={link}
                    maxLength={FOUNDING_CREATOR_LINK_MAX_LENGTH}
                    onChange={(e) =>
                      setLinks(
                        links.map((other, i) =>
                          i === index ? e.target.value : other,
                        ),
                      )
                    }
                    error={
                      link.trim() && !isWebLink(link)
                        ? t('creator.founders.link_invalid')
                        : undefined
                    }
                  />
                </div>
                {links.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-12 w-12 shrink-0"
                    aria-label={t('creator.founders.remove_link', {
                      number: index + 1,
                    })}
                    onClick={() =>
                      setLinks(links.filter((_, i) => i !== index))
                    }
                  >
                    <X size={18} aria-hidden />
                  </Button>
                ) : null}
              </div>
            ))}
            {links.length < FOUNDING_CREATOR_LINKS_MAX ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => setLinks([...links, ''])}
              >
                <Plus size={16} aria-hidden />
                {t('creator.founders.add_link')}
              </Button>
            ) : null}
            {touched && filled.length === 0 ? (
              <p className="text-xs font-medium text-red-400">
                {t('creator.founders.links_required')}
              </p>
            ) : null}
          </fieldset>

          <Input
            label={t('creator.founders.city')}
            value={city}
            autoComplete="address-level2"
            maxLength={FOUNDING_CREATOR_CITY_MAX_LENGTH}
            placeholder={t('creator.founders.city_placeholder')}
            onChange={(e) => setCity(e.target.value)}
            error={
              touched && !cityOk
                ? t('creator.founders.city_invalid')
                : undefined
            }
          />

          <div>
            <Textarea
              label={t('creator.founders.note')}
              value={note}
              rows={4}
              maxLength={FOUNDING_CREATOR_NOTE_MAX_LENGTH}
              placeholder={t('creator.founders.note_placeholder')}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="mt-1 text-right text-xs text-white/40 tabular-nums">
              {note.length}/{FOUNDING_CREATOR_NOTE_MAX_LENGTH}
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="min-h-12"
            isLoading={apply.isPending}
          >
            {t('creator.founders.send')}
          </Button>
        </form>
      </Card>
    </CreatorSection>
  );
}
