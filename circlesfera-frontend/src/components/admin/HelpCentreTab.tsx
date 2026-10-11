import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AdminArticle,
  AdminArticleSummary,
} from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { apiErrorCode, apiErrorDetails } from '../../utils/apiErrorMessage';
import { slugFromTitle } from '../../utils/articleBody';
import { ArticleBody } from '../support/ArticleBody';
import { Button, Input, Textarea } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { FilterDropdown } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

const TOPICS = ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'] as const;
type Topic = (typeof TOPICS)[number];

/** What is being written: a new article, or one that exists. */
interface Draft {
  id?: string;
  slug: string;
  // Once typed by hand, the address stops following the title.
  slugTouched: boolean;
  topic: Topic;
  position: number;
  status: 'DRAFT' | 'PUBLISHED';
  texts: Record<string, { title: string; body: string }>;
}

const LOCALES = ['en', 'es'];
const STATUS_COLORS: Record<Draft['status'], string> = {
  PUBLISHED: 'bg-green-500/10 text-green-400 border-green-500/20',
  DRAFT: 'bg-white/5 text-white/60 border-white/10',
};
const emptyDraft = (): Draft => ({
  slug: '',
  slugTouched: false,
  topic: 'OTHER',
  position: 0,
  status: 'DRAFT',
  texts: Object.fromEntries(
    LOCALES.map((locale) => [locale, { title: '', body: '' }]),
  ),
});
const draftOf = (article: AdminArticle): Draft => ({
  id: article.id,
  slug: article.slug,
  slugTouched: true,
  topic: article.topic,
  position: article.position,
  status: article.status,
  texts: Object.fromEntries(
    // In the same order as a new article, whatever order they are stored in.
    [...article.locales].sort().map((locale) => {
      const text = article.texts.find((one) => one.locale === locale);
      return [locale, { title: text?.title ?? '', body: text?.body ?? '' }];
    }),
  ),
});

/**
 * The help centre, for who leads support: the list of articles, drafts and
 * published, and the editor of one article in each language of the product.
 */
export default function HelpCentreTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [shown, setShown] = useState<'all' | Draft['status']>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [locale, setLocale] = useState('es');
  const [preview, setPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tr = (key: string, values?: Record<string, unknown>) =>
    t(`admin.support.help_centre.${key}`, values);

  const {
    data: articles = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin', 'support-articles'],
    queryFn: () => adminApi.getArticles().then((res) => res.data),
  });

  const done = (message: string, article?: AdminArticle) => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'support-articles'] });
    setDraft(article ? draftOf(article) : null);
    setDeleting(false);
    onToast(message, 'success');
  };
  const failed = (err: unknown) => {
    const missing = apiErrorDetails(err)?.missing;
    onToast(
      apiErrorCode(err) === 'ARTICLE_LANGUAGE_MISSING' && Array.isArray(missing)
        ? tr('toast_language_missing', {
            languages: missing
              .map((one) =>
                tr(`language.${one}`, { defaultValue: String(one) }),
              )
              .join(', '),
          })
        : t('admin.support.toast_error'),
      'error',
    );
  };
  const textsOf = (written: Draft) =>
    Object.entries(written.texts).map(([one, text]) => ({
      locale: one,
      title: text.title.trim(),
      body: text.body.trim(),
    }));

  const saveMutation = useMutation({
    mutationFn: (written: Draft) =>
      written.id
        ? adminApi.updateArticle(written.id, {
            topic: written.topic,
            position: written.position,
            texts: textsOf(written),
          })
        : adminApi.createArticle({
            slug: written.slug,
            topic: written.topic,
            position: written.position,
            texts: textsOf(written),
          }),
    onSuccess: (res) => done(tr('toast_saved'), res.data),
    onError: failed,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      publish ? adminApi.publishArticle(id) : adminApi.takeBackArticle(id),
    onSuccess: (res, variables) =>
      done(
        tr(variables.publish ? 'toast_published' : 'toast_taken_back'),
        res.data,
      ),
    onError: failed,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteArticle(id),
    onSuccess: () => done(tr('toast_deleted')),
    onError: failed,
  });
  const editMutation = useMutation({
    mutationFn: (id: string) => adminApi.getArticle(id),
    onSuccess: (res) => {
      setDraft(draftOf(res.data));
      setPreview(false);
    },
    onError: failed,
  });

  const backToList = () => {
    setDraft(null);
    setDeleting(false);
  };
  const text = draft?.texts[locale] ?? { title: '', body: '' };
  const setText = (changes: Partial<{ title: string; body: string }>) => {
    if (!draft) return;
    const next = { ...text, ...changes };
    setDraft({
      ...draft,
      texts: { ...draft.texts, [locale]: next },
      // A new article takes its address from its first title.
      ...(!draft.id &&
        !draft.slugTouched &&
        changes.title !== undefined && { slug: slugFromTitle(next.title) }),
    });
  };
  const hasTitle = draft
    ? Object.values(draft.texts).some((one) => one.title.trim())
    : false;
  const nameOf = (article: AdminArticleSummary) =>
    article.titles.es || article.titles.en || article.slug;
  const statusBadge = (status: Draft['status']) => (
    <div
      className={`w-fit px-2.5 py-1 rounded-full border text-xs font-bold ${STATUS_COLORS[status]}`}
    >
      {tr(`status.${status}`)}
    </div>
  );
  const row = (article: AdminArticleSummary) => (
    <AdminListRow
      className="rounded-xl border-white/10 bg-white/5 p-3 sm:p-4"
      title={nameOf(article)}
      subtitle={`${t(`supportPage.category.${article.topic}`)} · /help/${article.slug}`}
      badge={statusBadge(article.status)}
      meta={
        <>
          <span>
            {tr('useful_counts', {
              yes: article.usefulYes,
              no: article.usefulNo,
            })}
          </span>
          {article.missing.length > 0 && (
            <span className="font-semibold text-yellow-400">
              {tr('missing', {
                languages: article.missing
                  .map((one) => tr(`language.${one}`, { defaultValue: one }))
                  .join(', '),
              })}
            </span>
          )}
        </>
      }
      primaryAction={
        <Button
          variant="secondary"
          className="min-h-11 text-sm"
          aria-label={tr('edit_named', { title: nameOf(article) })}
          isLoading={
            editMutation.isPending && editMutation.variables === article.id
          }
          onClick={() => editMutation.mutate(article.id)}
        >
          {tr('edit')}
        </Button>
      }
    />
  );
  const visible =
    shown === 'all'
      ? articles
      : articles.filter((article) => article.status === shown);

  if (draft) {
    return (
      <div className="space-y-2.5">
        <AdminPageHeader
          title={
            draft.id
              ? draft.texts.es?.title || draft.texts.en?.title || draft.slug
              : tr('new')
          }
          subtitle={draft.id ? `/help/${draft.slug}` : tr('new_subtitle')}
          actions={
            <>
              {draft.id && statusBadge(draft.status)}
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 text-sm"
                onClick={backToList}
              >
                <ArrowLeft size={16} aria-hidden />
                {tr('back')}
              </Button>
            </>
          }
        />
        <form
          className="max-w-3xl space-y-3 rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate(draft);
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-56">
              <FilterDropdown
                label={tr('field_topic')}
                value={draft.topic}
                onChange={(value) =>
                  setDraft({ ...draft, topic: value as Topic })
                }
                options={TOPICS.map((value) => ({
                  value,
                  label: t(`supportPage.category.${value}`),
                }))}
              />
            </div>
            <div className="w-28">
              <Input
                label={tr('field_position')}
                type="number"
                min={0}
                max={9999}
                value={draft.position}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    position: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </div>
          </div>
          <Input
            label={tr('field_slug')}
            value={draft.slug}
            maxLength={120}
            // The address of an article does not change once it exists.
            disabled={!!draft.id}
            onChange={(event) =>
              setDraft({
                ...draft,
                slug: event.target.value,
                slugTouched: true,
              })
            }
          />
          <p className="text-xs text-white/60">
            {tr(draft.id ? 'slug_fixed_hint' : 'slug_hint')}
          </p>
          <AdminSegmentedControl
            value={locale}
            onChange={setLocale}
            options={Object.keys(draft.texts).map((one) => ({
              value: one,
              label: tr(`language.${one}`, { defaultValue: one }),
            }))}
          />
          <Input
            label={tr('field_title')}
            value={text.title}
            maxLength={150}
            onChange={(event) => setText({ title: event.target.value })}
          />
          {preview ? (
            <section
              aria-label={tr('preview')}
              className="rounded-xl border border-white/10 bg-black/30 p-4"
            >
              <h3 className="mb-3 text-2xl font-bold text-white">
                {text.title}
              </h3>
              <ArticleBody body={text.body} />
            </section>
          ) : (
            <>
              <Textarea
                label={tr('field_body')}
                value={text.body}
                rows={10}
                maxLength={20000}
                onChange={(event) => setText({ body: event.target.value })}
              />
              <p className="text-xs text-white/60">{tr('body_hint')}</p>
            </>
          )}
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => setPreview(!preview)}
              >
                {tr(preview ? 'write' : 'preview')}
              </Button>
              {draft.id && draft.status === 'DRAFT' && (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  isLoading={deleteMutation.isPending}
                  onClick={() =>
                    deleting
                      ? deleteMutation.mutate(draft.id as string)
                      : setDeleting(true)
                  }
                >
                  {tr(deleting ? 'delete_confirm' : 'delete')}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.id && (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  isLoading={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({
                      id: draft.id as string,
                      publish: draft.status === 'DRAFT',
                    })
                  }
                >
                  {tr(draft.status === 'DRAFT' ? 'publish' : 'take_back')}
                </Button>
              )}
              <Button
                type="submit"
                className="min-h-11"
                isLoading={saveMutation.isPending}
                disabled={!hasTitle || !draft.slug.trim()}
              >
                {tr('save')}
              </Button>
            </div>
          </div>
          {draft.id && draft.status === 'PUBLISHED' && (
            <p className="text-xs text-white/60">{tr('published_hint')}</p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={tr('title')}
        subtitle={tr('subtitle')}
        actions={
          <Button
            className="min-h-11 text-sm"
            onClick={() => {
              setDraft(emptyDraft());
              setLocale('es');
              setPreview(false);
            }}
          >
            {tr('new')}
          </Button>
        }
      />

      {/* The control draws its own box: no filter bar around it. */}
      <AdminSegmentedControl
        value={shown}
        onChange={(value) => setShown(value as typeof shown)}
        options={[
          { value: 'all', label: tr('filter_all') },
          { value: 'PUBLISHED', label: tr('filter_published') },
          { value: 'DRAFT', label: tr('filter_drafts') },
        ]}
      />

      {/* Each article is a card of its own; only a state with no rows gets
          the one card of the list. */}
      {isLoading ? (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <AdminListSkeleton rows={6} />
        </div>
      ) : isError ? (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <AdminEmptyState icon={BookOpen} title={tr('load_failed')} />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <AdminEmptyState
            icon={BookOpen}
            title={tr(articles.length === 0 ? 'empty_title' : 'empty_filtered')}
            description={articles.length === 0 ? tr('empty') : undefined}
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((article) => (
            <li key={article.id}>{row(article)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
