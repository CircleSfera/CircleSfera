import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskArticlesService } from './helpdesk-articles.service.js';

describe('HelpdeskArticlesService', () => {
  const store = {
    organizationLocales: vi.fn(),
    articles: vi.fn(),
    findArticle: vi.fn(),
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    setArticleStatus: vi.fn(),
    deleteDraftArticle: vi.fn(),
  };
  const staffLog = { record: vi.fn() };
  let service: HelpdeskArticlesService;

  const article = (overrides: Record<string, unknown> = {}) => ({
    id: 'a-1',
    slug: 'refunds',
    topic: 'PAYMENTS',
    status: 'DRAFT',
    position: 1,
    usefulYes: 3,
    usefulNo: 1,
    authorRef: 'admin-1',
    updatedAt: new Date('2026-09-01'),
    texts: [
      { locale: 'es', title: 'Reembolsos', body: 'Texto' },
      { locale: 'en', title: 'Refunds', body: 'Text' },
    ],
    ...overrides,
  });
  const text = (locale: string, title = 'Title', body = 'Body') => ({
    locale,
    title,
    body,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    store.organizationLocales.mockResolvedValue(['es', 'en']);
    store.findArticle.mockResolvedValue(article());
    store.createArticle.mockResolvedValue({ id: 'a-1' });
    store.updateArticle.mockResolvedValue(true);
    store.setArticleStatus.mockResolvedValue(true);
    store.deleteDraftArticle.mockResolvedValue(true);
    service = new HelpdeskArticlesService(store as never, staffLog);
  });

  it('lists every article with its titles, its counts and the languages it lacks', async () => {
    store.articles.mockResolvedValue([
      article(),
      article({
        id: 'a-2',
        slug: 'draft',
        texts: [
          { locale: 'es', title: 'Borrador' },
          { locale: 'en', title: '' },
        ],
      }),
    ]);

    const list = await service.list();

    expect(list[0]).toMatchObject({
      id: 'a-1',
      slug: 'refunds',
      status: 'DRAFT',
      usefulYes: 3,
      usefulNo: 1,
      titles: { es: 'Reembolsos', en: 'Refunds' },
      missing: [],
    });
    expect(list[1].missing).toEqual(['en']);
    // Who wrote it stays with the record.
    expect(list[0]).not.toHaveProperty('authorRef');
  });

  it('reads one article with all its texts and the languages it is written in', async () => {
    expect(await service.get('a-1')).toMatchObject({
      slug: 'refunds',
      locales: ['es', 'en'],
      texts: article().texts,
    });

    store.findArticle.mockResolvedValue(null);
    await expect(service.get('missing')).rejects.toMatchObject({ status: 404 });
  });

  describe('creating', () => {
    const dto = {
      slug: 'refunds',
      topic: 'PAYMENTS' as const,
      texts: [text('es', '  Reembolsos  ', '  Texto  ')],
    };

    it('stores a draft written by who is signed in, tidy, and records it without its text', async () => {
      await service.create('admin-1', dto);

      expect(store.createArticle).toHaveBeenCalledWith({
        slug: 'refunds',
        topic: 'PAYMENTS',
        position: 0,
        authorRef: 'admin-1',
        texts: [{ locale: 'es', title: 'Reembolsos', body: 'Texto' }],
      });
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        'a-1',
        'Created article refunds',
        'article',
      );
    });

    it('needs a title in at least one language', async () => {
      await expect(
        service.create('admin-1', { ...dto, texts: [text('es', '   ')] }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.create('admin-1', { ...dto, texts: [] }),
      ).rejects.toMatchObject({ status: 400 });
      expect(store.createArticle).not.toHaveBeenCalled();
    });

    it('refuses a language the organization does not write in, and a language given twice', async () => {
      await expect(
        service.create('admin-1', { ...dto, texts: [text('fr')] }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.create('admin-1', { ...dto, texts: [text('es'), text('es')] }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('says so when another article has the address, and passes on any other failure', async () => {
      store.createArticle.mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );
      await expect(service.create('admin-1', dto)).rejects.toMatchObject({
        status: 409,
      });

      store.createArticle.mockRejectedValueOnce(new Error('db down'));
      await expect(service.create('admin-1', dto)).rejects.toThrow('db down');
      expect(staffLog.record).not.toHaveBeenCalled();
    });
  });

  describe('changing', () => {
    it('changes topic, place and the texts given', async () => {
      await service.update('a-1', {
        topic: 'ACCOUNT',
        position: 4,
        texts: [text('en', ' Refunds ', ' New text ')],
      });

      expect(store.updateArticle).toHaveBeenCalledWith(
        'a-1',
        { topic: 'ACCOUNT', position: 4 },
        [{ locale: 'en', title: 'Refunds', body: 'New text' }],
      );
    });

    it('changes nothing of an article that is not there, and accepts a change with no texts', async () => {
      await service.update('a-1', { position: 2 });
      expect(store.updateArticle).toHaveBeenLastCalledWith(
        'a-1',
        { topic: undefined, position: 2 },
        [],
      );

      store.updateArticle.mockResolvedValue(false);
      await expect(service.update('missing', {})).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('publishing', () => {
    it('publishes an article that has every language, and records it', async () => {
      await service.publish('admin-1', 'a-1');

      expect(store.setArticleStatus).toHaveBeenCalledWith(
        'a-1',
        'PUBLISHED',
        expect.any(Date),
      );
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        'a-1',
        'Published article refunds',
        'article',
      );
    });

    it.each([
      ['no text at all in a language', [text('es')]],
      ['a title without a body', [text('es'), text('en', 'Refunds', '')]],
      ['a body without a title', [text('es'), text('en', '', 'Text')]],
    ])(
      'refuses an article with %s, and says which language',
      async (_case, texts) => {
        store.findArticle.mockResolvedValue(article({ texts }));

        await expect(service.publish('admin-1', 'a-1')).rejects.toMatchObject({
          status: 409,
          response: {
            errorCode: 'ARTICLE_LANGUAGE_MISSING',
            details: { missing: ['en'] },
          },
        });
        expect(store.setArticleStatus).not.toHaveBeenCalled();
        expect(staffLog.record).not.toHaveBeenCalled();
      },
    );

    it('takes a published article back to draft, and records it', async () => {
      store.findArticle.mockResolvedValue(article({ status: 'PUBLISHED' }));

      await service.takeBack('admin-1', 'a-1');

      expect(store.setArticleStatus).toHaveBeenCalledWith(
        'a-1',
        'DRAFT',
        expect.any(Date),
      );
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        'a-1',
        'Took back article refunds',
        'article',
      );
    });
  });

  describe('deleting', () => {
    it('deletes a draft and records it', async () => {
      expect(await service.remove('admin-1', 'a-1')).toEqual({ deleted: true });
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        'a-1',
        'Deleted article refunds',
        'article',
      );
    });

    it('does not delete a published article, nor one published in between', async () => {
      store.findArticle.mockResolvedValue(article({ status: 'PUBLISHED' }));
      await expect(service.remove('admin-1', 'a-1')).rejects.toMatchObject({
        status: 409,
      });
      expect(store.deleteDraftArticle).not.toHaveBeenCalled();

      store.findArticle.mockResolvedValue(article());
      store.deleteDraftArticle.mockResolvedValue(false);
      await expect(service.remove('admin-1', 'a-1')).rejects.toMatchObject({
        status: 409,
      });
      expect(staffLog.record).not.toHaveBeenCalled();
    });

    it('says so when the article does not exist, for every action on it', async () => {
      store.findArticle.mockResolvedValue(null);

      for (const act of [
        () => service.publish('admin-1', 'x'),
        () => service.takeBack('admin-1', 'x'),
        () => service.remove('admin-1', 'x'),
      ]) {
        await expect(act()).rejects.toMatchObject({ status: 404 });
      }
    });
  });
});
