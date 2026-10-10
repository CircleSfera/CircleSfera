import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskHelpCentreService } from './helpdesk-help-centre.service.js';

describe('HelpdeskHelpCentreService', () => {
  const store = {
    organizationLocales: vi.fn(),
    publishedArticles: vi.fn(),
    publishedArticle: vi.fn(),
  };
  let service: HelpdeskHelpCentreService;
  const found = (slug: string, title: string, topic = 'OTHER') => ({
    slug,
    topic,
    texts: [{ title }],
  });

  beforeEach(() => {
    vi.resetAllMocks();
    store.organizationLocales.mockResolvedValue(['en', 'es']);
    store.publishedArticles.mockResolvedValue([]);
    service = new HelpdeskHelpCentreService(store as never);
  });

  it('lists the published articles in the language of the reader: address, topic and title', async () => {
    store.publishedArticles.mockResolvedValue([
      found('verificar', 'Verificar mi identidad', 'ACCOUNT'),
    ]);

    expect(await service.list({ locale: 'es' })).toEqual({
      locale: 'es',
      articles: [
        {
          slug: 'verificar',
          topic: 'ACCOUNT',
          title: 'Verificar mi identidad',
        },
      ],
    });
    expect(store.publishedArticles).toHaveBeenCalledWith('es', {}, 20);
  });

  it.each([
    ['es-ES', 'es'],
    ['ES', 'es'],
    ['fr', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ])('answers a reader who asks in "%s" in "%s"', async (asked, expected) => {
    expect((await service.list({ locale: asked })).locale).toBe(expected);
  });

  it('answers in the first language of an organization that does not write in English, and in none when it has none', async () => {
    store.organizationLocales.mockResolvedValue(['es', 'pt']);
    expect((await service.list({ locale: 'fr' })).locale).toBe('es');

    store.publishedArticles.mockClear();
    store.organizationLocales.mockResolvedValue([]);
    expect(await service.list({ locale: 'es' })).toEqual({
      locale: null,
      articles: [],
    });
    await expect(service.article('x', 'es')).rejects.toMatchObject({
      status: 404,
    });
    expect(store.publishedArticles).not.toHaveBeenCalled();
    expect(store.publishedArticle).not.toHaveBeenCalled();
  });

  it('looks for the words given, inside a topic, and puts the ones with them in the title first', async () => {
    store.publishedArticles.mockResolvedValue([
      found('a', 'Verify your identity'),
      found('b', 'How REFUNDS work'),
      found('c', 'Plans'),
      found('d', 'Refunds for creators'),
    ]);

    const result = await service.list({
      locale: 'en',
      q: '  refunds ',
      topic: 'PAYMENTS',
    });

    expect(store.publishedArticles).toHaveBeenCalledWith(
      'en',
      { search: ['refunds'], topic: 'PAYMENTS' },
      20,
    );
    expect(result.articles.map((article) => article.slug)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('looks for each word of a sentence, leaving out the short ones and the repeated ones, and puts first the titles with more of them', async () => {
    store.publishedArticles.mockResolvedValue([
      found('a', 'What is in each plan'),
      found('b', 'Plans and what they include'),
      found('c', 'Verify your identity'),
    ]);

    const result = await service.list({
      locale: 'en',
      q: "I don't know what the Plans include, or the plans!",
    });

    expect(store.publishedArticles).toHaveBeenCalledWith(
      'en',
      { search: ['know', 'what', 'plans', 'include'] },
      20,
    );
    expect(result.articles.map((article) => article.slug)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('looks for no more than eight words', async () => {
    store.publishedArticles.mockResolvedValue([]);
    await service.list({
      locale: 'en',
      q: 'first second third fourth fifth sixth seventh eighth ninth tenth',
    });
    expect(store.publishedArticles.mock.calls[0][1].search).toHaveLength(8);
  });

  it('looks for the text as typed when no word in it is long enough', async () => {
    store.publishedArticles.mockResolvedValue([]);
    await service.list({ locale: 'en', q: 'ID' });
    expect(store.publishedArticles).toHaveBeenCalledWith(
      'en',
      { search: ['id'] },
      20,
    );
  });

  it.each(['', ' ', 'a', ' a '])(
    'finds nothing for a search as short as "%s"',
    async (q) => {
      expect(await service.list({ locale: 'en', q })).toEqual({
        locale: 'en',
        articles: [],
      });
      expect(store.publishedArticles).not.toHaveBeenCalled();
    },
  );

  it('leaves out an article that has no text in the language, should one be returned', async () => {
    store.publishedArticles.mockResolvedValue([
      { slug: 'x', topic: 'OTHER', texts: [] },
      found('y', 'Title'),
    ]);

    expect((await service.list({ locale: 'en' })).articles).toEqual([
      { slug: 'y', topic: 'OTHER', title: 'Title' },
    ]);
  });

  it('reads one published article in the language of the reader', async () => {
    const updatedAt = new Date('2026-09-01');
    store.publishedArticle.mockResolvedValue({
      slug: 'refunds',
      topic: 'PAYMENTS',
      updatedAt,
      texts: [{ title: 'Reembolsos', body: 'Texto' }],
    });

    expect(await service.article('refunds', 'es-ES')).toEqual({
      slug: 'refunds',
      topic: 'PAYMENTS',
      locale: 'es',
      title: 'Reembolsos',
      body: 'Texto',
      updatedAt,
    });
    expect(store.publishedArticle).toHaveBeenCalledWith('refunds', 'es');
  });

  it('answers the same for a draft, for an address that is nothing and for an article without a text', async () => {
    store.publishedArticle.mockResolvedValueOnce(null);
    await expect(service.article('draft', 'es')).rejects.toMatchObject({
      status: 404,
    });

    store.publishedArticle.mockResolvedValueOnce({
      slug: 'x',
      topic: 'OTHER',
      updatedAt: new Date(),
      texts: [],
    });
    await expect(service.article('x', 'es')).rejects.toMatchObject({
      status: 404,
    });
  });
});
