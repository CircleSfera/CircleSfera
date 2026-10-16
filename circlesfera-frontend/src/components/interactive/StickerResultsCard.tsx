import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  BarChart2,
  Check,
  HelpCircle,
  Send,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { FeedSticker } from '../../utils/storySticker';
import { buildAnswerElement } from '../story/storyComposer.append';
import { storyStartRoute } from '../story/storyStart';
import UserAvatar from '../UserAvatar';
import {
  type ResponderProfile,
  readSticker,
  type StickerResponder,
} from './stickerResults';

const ICONS = {
  POLL: BarChart2,
  QUIZ: BadgeCheck,
  SLIDER: SlidersHorizontal,
  QUESTION: HelpCircle,
  COUNTDOWN: Timer,
} as const;

/** The stickers whose results the author reads in the viewers sheet. */
export const RESULT_KINDS: ReadonlySet<string> = new Set(Object.keys(ICONS));

function Person({
  profile,
  aside,
}: {
  profile: ResponderProfile;
  aside?: string;
}) {
  return (
    <li className="flex items-center gap-3 min-h-11">
      <UserAvatar
        src={profile.avatar || undefined}
        alt={profile.username}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">
          {profile.username}
        </span>
        {profile.fullName ? (
          <span className="block truncate text-xs text-white/50">
            {profile.fullName}
          </span>
        ) : null}
      </span>
      {aside ? (
        <span className="shrink-0 text-sm font-semibold text-white/80">
          {aside}
        </span>
      ) : null}
    </li>
  );
}

const percent = (value: number) => `${Math.round(value * 100)} %`;

/**
 * What one sticker of the author's story has gathered: each option with its
 * votes and who chose it, a slider's average and each person's value, or a
 * question's answers.
 */
export function StickerResultsCard({ sticker }: { sticker: FeedSticker }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['story-sticker', sticker.id],
    queryFn: () => readSticker(sticker.id),
  });
  const Icon = ICONS[sticker.kind as keyof typeof ICONS] ?? BarChart2;
  const title =
    data?.settings.question ||
    data?.settings.prompt ||
    data?.settings.title ||
    t(`story.results.kind_${sticker.kind.toLowerCase()}`);
  const responders: StickerResponder[] = data?.responders ?? [];

  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-white/8 bg-white/4 p-4 space-y-3"
    >
      <header className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary-text">
          <Icon size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{title}</p>
          <p className="text-xs text-white/50">
            {t(
              sticker.kind === 'COUNTDOWN'
                ? 'story.results.reminders'
                : 'story.results.responses',
              { count: data?.totalResponses ?? 0 },
            )}
          </p>
        </div>
        {data?.settings.emoji ? (
          <span className="text-2xl" aria-hidden>
            {data.settings.emoji}
          </span>
        ) : null}
      </header>

      {isLoading ? (
        <p className="text-sm text-white/50">{t('common.loading')}</p>
      ) : isError || !data ? (
        <p role="alert" className="text-sm text-white/60">
          {t('story.results.error')}
        </p>
      ) : data.options ? (
        <ol className="space-y-3">
          {data.options.map((option) => {
            const right =
              sticker.kind === 'QUIZ' &&
              data.settings.correctIndex === option.index;
            const people = responders.filter(
              (r) => r.optionIndex === option.index,
            );
            return (
              <li key={option.index} className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-white">
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {option.text}
                  </span>
                  {right ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-white/80">
                      <Check size={14} aria-hidden />
                      {t('story.results.right_answer')}
                    </span>
                  ) : null}
                  <span className="shrink-0 tabular-nums text-white/70">
                    {t('story.results.votes', {
                      count: option.votes,
                      percentage: Math.round(option.percentage),
                    })}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-brand-primary to-brand-blue"
                    style={{ width: `${option.percentage}%` }}
                  />
                </div>
                {people.length > 0 ? (
                  <ul className="space-y-1">
                    {people.map((r) => (
                      <Person key={r.profile.id} profile={r.profile} />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : sticker.kind === 'SLIDER' ? (
        <>
          <p className="text-sm text-white">
            {data.average == null
              ? t('story.results.no_responses')
              : t('story.results.average', { value: percent(data.average) })}
          </p>
          {responders.length > 0 ? (
            <ul className="space-y-1">
              {responders.map((r) => (
                <Person
                  key={r.profile.id}
                  profile={r.profile}
                  aside={r.value == null ? undefined : percent(r.value)}
                />
              ))}
            </ul>
          ) : null}
        </>
      ) : sticker.kind === 'COUNTDOWN' ? (
        responders.length > 0 ? (
          <ul className="space-y-1">
            {responders.map((r) => (
              <Person key={r.profile.id} profile={r.profile} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/50">
            {t('story.results.no_reminders')}
          </p>
        )
      ) : data.answers && data.answers.length > 0 ? (
        <ul className="space-y-3">
          {data.answers.map((answer) => (
            <li key={answer.id} className="space-y-1">
              <ul>
                <Person profile={answer.profile} />
              </ul>
              <p className="pl-11 text-sm leading-snug text-white/90">
                {answer.text}
              </p>
              <div className="pl-9">
                <button
                  type="button"
                  onClick={() => {
                    // A new story with the question and this answer on it.
                    const route = storyStartRoute({
                      elements: [
                        buildAnswerElement({
                          prompt: String(data.settings.prompt ?? ''),
                          answer: answer.text,
                        }),
                      ],
                    });
                    navigate(route.to, route.options);
                  }}
                  aria-label={t('story.results.share_answer_label')}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-brand-primary-text hover:bg-white/6"
                >
                  <Send size={15} aria-hidden />
                  {t('story.results.share_answer')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/50">
          {t('story.results.no_responses')}
        </p>
      )}
    </section>
  );
}
