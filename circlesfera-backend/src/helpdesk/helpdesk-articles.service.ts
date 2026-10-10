import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ArticleTextDto,
  CreateArticleDto,
  UpdateArticleDto,
} from './dto/article.dto.js';
import { HelpdeskStore } from './helpdesk.store.js';
import {
  STAFF_ACTION_LOG,
  type StaffActionLog,
} from './helpdesk-host.contracts.js';

// The articles of the help centre, for who writes them. An article is
// written once and translated; it is public only once it is published, and
// it can be published only with a title and a body in every language of
// its organization.
@Injectable()
export class HelpdeskArticlesService {
  constructor(
    @Inject(HelpdeskStore) private readonly store: HelpdeskStore,
    @Inject(STAFF_ACTION_LOG) private readonly staffLog: StaffActionLog,
  ) {}

  // The texts as given, tidy, one per language of the organization.
  private async textsFor(texts: ArticleTextDto[]) {
    const locales = await this.store.organizationLocales();
    const seen = new Set<string>();
    return texts.map((text) => {
      if (!locales.includes(text.locale)) {
        throw new BadRequestException(
          `Articles are not written in "${text.locale}" here`,
        );
      }
      if (seen.has(text.locale)) {
        throw new BadRequestException(
          `The text in "${text.locale}" is given twice`,
        );
      }
      seen.add(text.locale);
      return {
        locale: text.locale,
        title: text.title.trim(),
        body: text.body.trim(),
      };
    });
  }

  private async articleOrFail(id: string) {
    const article = await this.store.findArticle(id);
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  async list() {
    const [articles, locales] = await Promise.all([
      this.store.articles(),
      this.store.organizationLocales(),
    ]);
    return articles.map((article) => ({
      id: article.id,
      slug: article.slug,
      topic: article.topic,
      status: article.status,
      position: article.position,
      usefulYes: article.usefulYes,
      usefulNo: article.usefulNo,
      updatedAt: article.updatedAt,
      titles: Object.fromEntries(
        article.texts.map((text) => [text.locale, text.title]),
      ),
      // The languages it still lacks a title in.
      missing: locales.filter(
        (locale) =>
          !article.texts.some((text) => text.locale === locale && text.title),
      ),
    }));
  }

  async get(id: string) {
    const [article, locales] = await Promise.all([
      this.articleOrFail(id),
      this.store.organizationLocales(),
    ]);
    return {
      id: article.id,
      slug: article.slug,
      topic: article.topic,
      status: article.status,
      position: article.position,
      usefulYes: article.usefulYes,
      usefulNo: article.usefulNo,
      updatedAt: article.updatedAt,
      // The languages an article is written in here.
      locales,
      texts: article.texts,
    };
  }

  async create(agentRef: string, dto: CreateArticleDto) {
    const texts = await this.textsFor(dto.texts);
    if (!texts.some((text) => text.title)) {
      throw new BadRequestException(
        'An article needs a title in at least one language',
      );
    }
    let created: { id: string };
    try {
      created = await this.store.createArticle({
        slug: dto.slug,
        topic: dto.topic,
        position: dto.position ?? 0,
        authorRef: agentRef,
        texts,
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Another article has this address');
      }
      throw err;
    }
    await this.staffLog.record(
      agentRef,
      created.id,
      `Created article ${dto.slug}`,
      'article',
    );
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateArticleDto) {
    const texts = await this.textsFor(dto.texts ?? []);
    const done = await this.store.updateArticle(
      id,
      { topic: dto.topic, position: dto.position },
      texts,
    );
    if (!done) throw new NotFoundException('Article not found');
    return this.get(id);
  }

  // Published only when every language of the organization has its title
  // and its body: a reader always finds the article in their language.
  async publish(agentRef: string, id: string) {
    const [article, locales] = await Promise.all([
      this.articleOrFail(id),
      this.store.organizationLocales(),
    ]);
    const missing = locales.filter(
      (locale) =>
        !article.texts.some(
          (text) => text.locale === locale && text.title && text.body,
        ),
    );
    if (missing.length > 0) {
      throw new ConflictException({
        message: `The article has no title or no text in: ${missing.join(', ')}`,
        // The shape every error of the product has: a code and its details.
        errorCode: 'ARTICLE_LANGUAGE_MISSING',
        details: { missing },
      });
    }
    await this.store.setArticleStatus(id, 'PUBLISHED', new Date());
    await this.staffLog.record(
      agentRef,
      id,
      `Published article ${article.slug}`,
      'article',
    );
    return this.get(id);
  }

  async takeBack(agentRef: string, id: string) {
    const article = await this.articleOrFail(id);
    await this.store.setArticleStatus(id, 'DRAFT', new Date());
    await this.staffLog.record(
      agentRef,
      id,
      `Took back article ${article.slug}`,
      'article',
    );
    return this.get(id);
  }

  // Only a draft is deleted: a published article is taken back first.
  async remove(agentRef: string, id: string) {
    const article = await this.articleOrFail(id);
    if (
      article.status !== 'DRAFT' ||
      !(await this.store.deleteDraftArticle(id))
    ) {
      throw new ConflictException(
        'A published article is taken back before it is deleted',
      );
    }
    await this.staffLog.record(
      agentRef,
      id,
      `Deleted article ${article.slug}`,
      'article',
    );
    return { deleted: true };
  }
}
