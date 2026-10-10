import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Button, Dialog, Input, Textarea } from '../ui';
import { AdminSegmentedControl } from './AdminSegmentedControl';
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
export function HelpCentreEditor({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [locale, setLocale] = useState('es');
  const [preview, setPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tr = (key: string, values?: Record<string, unknown>) =>
    t(`admin.support.help_centre.${key}`, values);

  const { data: articles = [] } = useQuery({
    queryKey: ['admin', 'support-articles'],
    queryFn: () => adminApi.getArticles().then((res) => res.data),
    enabled: open,
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

  const close = () => {
    setOpen(false);
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
  const row = (article: AdminArticleSummary) => (
    <li
      key={article.id}
      className="rounded-xl border border-white/10 bg-white/5 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-white wrap-break-word">
          {article.titles.es || article.titles.en || article.slug}
        </p>
        <span
          className={`text-xs font-semibold ${
            article.status === 'PUBLISHED' ? 'text-green-400' : 'text-white/60'
          }`}
        >
          {tr(`status.${article.status}`)}
        </span>
      </div>
      <p className="mt-1 text-xs text-white/60">
        {t(`supportPage.category.${article.topic}`)} · /help/{article.slug} ·{' '}
        {tr('useful_counts', {
          yes: article.usefulYes,
          no: article.usefulNo,
        })}
      </p>
      {article.missing.length > 0 && (
        <p className="mt-1 text-xs font-semibold text-yellow-400">
          {tr('missing', {
            languages: article.missing
              .map((one) => tr(`language.${one}`, { defaultValue: one }))
              .join(', '),
          })}
        </p>
      )}
      <Button
        variant="secondary"
        className="mt-2 min-h-11 text-sm"
        aria-label={tr('edit_named', {
          title: article.titles.es || article.titles.en || article.slug,
        })}
        isLoading={
          editMutation.isPending && editMutation.variables === article.id
        }
        onClick={() => editMutation.mutate(article.id)}
      >
        {tr('edit')}
      </Button>
    </li>
  );

  return (
    <>
      <Button
        variant="secondary"
        className="min-h-11 text-sm"
        onClick={() => setOpen(true)}
      >
        {tr('open')}
      </Button>
      <Dialog isOpen={open} onClose={close} title={tr('title')} maxWidth="2xl">
        {draft ? (
          <form
            className="space-y-3"
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
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => {
                    setDraft(null);
                    setDeleting(false);
                  }}
                >
                  {tr('back')}
                </Button>
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
        ) : (
          <div className="space-y-3">
            {articles.length === 0 && (
              <p className="text-sm text-white/70">{tr('empty')}</p>
            )}
            <ul className="space-y-2">{articles.map(row)}</ul>
            <Button
              className="min-h-11"
              onClick={() => {
                setDraft(emptyDraft());
                setLocale('es');
                setPreview(false);
              }}
            >
              {tr('new')}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
