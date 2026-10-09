import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { HelpdeskStore } from './helpdesk.store.js';

const MAX_RESULTS = 20;
const MIN_SEARCH = 2;
// A word shorter than this says little on its own ("the", "los", "que").
const MIN_WORD = 4;
const MAX_WORDS = 8;

// What to look for in what was typed: each word long enough to mean
// something, or, when there is none, the text as typed.
function wordsOf(typed: string): string[] {
  const words = typed
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_WORD);
  return words.length > 0
    ? [...new Set(words)].slice(0, MAX_WORDS)
    : [typed.toLowerCase()];
}

// The help centre as anyone reads it: published articles only, in the
// language of the reader, and nothing about who wrote them or how they were
// received.
@Injectable()
export class HelpdeskHelpCentreService {
  constructor(@Inject(HelpdeskStore) private readonly store: HelpdeskStore) {}

  // The language to answer in: the reader's, when articles are written in
  // it; otherwise English, or the first language of the organization.
  private async languageFor(asked?: string): Promise<string | undefined> {
    const locales = await this.store.organizationLocales();
    const wanted = (asked ?? '').trim().toLowerCase().split('-')[0];
    if (locales.includes(wanted)) return wanted;
    return locales.includes('en') ? 'en' : locales[0];
  }

  async list(query: { locale?: string; q?: string; topic?: string }) {
    const locale = await this.languageFor(query.locale);
    const typed = query.q?.trim();
    // A search too short to mean anything finds nothing.
    if (
      !locale ||
      (query.q !== undefined && (typed ?? '').length < MIN_SEARCH)
    ) {
      return { locale: locale ?? null, articles: [] };
    }
    const words = typed ? wordsOf(typed) : [];
    const found = await this.store.publishedArticles(
      locale,
      {
        ...(words.length > 0 && { search: words }),
        ...(query.topic && { topic: query.topic as never }),
      },
      MAX_RESULTS,
    );
    const articles = found
      .filter((article) => article.texts[0])
      .map((article) => ({
        slug: article.slug,
        topic: article.topic,
        title: article.texts[0].title,
      }));
    if (words.length > 0) {
      // The ones with more of the words in their title come first.
      const inTitle = (title: string) =>
        words.filter((word) => title.toLowerCase().includes(word)).length;
      articles.sort((a, b) => inTitle(b.title) - inTitle(a.title));
    }
    return { locale, articles };
  }

  // One published article. A draft and an address that is nothing answer
  // the same.
  async article(slug: string, asked?: string) {
    const locale = await this.languageFor(asked);
    const article = locale
      ? await this.store.publishedArticle(slug, locale)
      : null;
    const text = article?.texts[0];
    if (!article || !text) throw new NotFoundException('Article not found');
    return {
      slug: article.slug,
      topic: article.topic,
      locale,
      title: text.title,
      body: text.body,
      updatedAt: article.updatedAt,
    };
  }

  // A reader says whether a published article helped. Only the count is
  // kept: nothing about who answered.
  async feedback(slug: string, useful: boolean): Promise<void> {
    if (!(await this.store.countArticleFeedback(slug, useful))) {
      throw new NotFoundException('Article not found');
    }
  }
}
