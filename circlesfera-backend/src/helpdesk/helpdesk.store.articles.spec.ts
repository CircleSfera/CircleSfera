import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';

// The queries of the help centre: every one carries the organization, and
// the ones anyone can ask return published articles only.
describe('HelpdeskStore: articles', () => {
  // What a transaction writes through: an edit is one unit.
  const tx = {
    helpdeskArticle: { updateMany: vi.fn() },
    helpdeskArticleText: { upsert: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    helpdeskOrganization: { findUnique: vi.fn() },
    helpdeskArticle: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'a-1' }),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    helpdeskArticleText: { upsert: vi.fn() },
  };
  let store: HelpdeskStore;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.helpdeskArticle.updateMany.mockResolvedValue({ count: 1 });
    tx.helpdeskArticle.updateMany.mockResolvedValue({ count: 1 });
    tx.helpdeskArticleText.upsert.mockResolvedValue({});
    prisma.helpdeskArticle.deleteMany.mockResolvedValue({ count: 1 });
    store = new HelpdeskStore(prisma as never, { current: () => 'org-1' });
  });

  it('reads the languages of its own organization, and none when it is gone', async () => {
    prisma.helpdeskOrganization.findUnique.mockResolvedValueOnce({
      locales: ['es', 'en'],
    });
    expect(await store.organizationLocales()).toEqual(['es', 'en']);
    expect(prisma.helpdeskOrganization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { locales: true },
    });

    prisma.helpdeskOrganization.findUnique.mockResolvedValueOnce(null);
    expect(await store.organizationLocales()).toEqual([]);
  });

  it('lists and finds articles only inside the organization', async () => {
    await store.articles();
    await store.findArticle('a-1');

    expect(prisma.helpdeskArticle.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
    });
    expect(prisma.helpdeskArticle.findFirst.mock.calls[0][0].where).toEqual({
      id: 'a-1',
      organizationId: 'org-1',
    });
  });

  it('creates an article in the organization, with its texts', async () => {
    const texts = [{ locale: 'es', title: 'Hola', body: 'Texto' }];

    await store.createArticle({
      slug: 'hola',
      topic: 'ACCOUNT',
      position: 2,
      authorRef: 'admin-1',
      texts,
    });

    expect(prisma.helpdeskArticle.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        slug: 'hola',
        topic: 'ACCOUNT',
        position: 2,
        authorRef: 'admin-1',
        texts: { create: texts },
      },
      select: { id: true },
    });
  });

  it('changes topic, place and texts of an article of the organization, and nothing else', async () => {
    const done = await store.updateArticle(
      'a-1',
      { topic: 'PAYMENTS', position: 3 },
      [{ locale: 'en', title: 'Hi', body: 'Text' }],
    );

    expect(done).toBe(true);
    const update = tx.helpdeskArticle.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'a-1', organizationId: 'org-1' });
    expect(Object.keys(update.data).sort()).toEqual([
      'position',
      'topic',
      'updatedAt',
    ]);
    expect(tx.helpdeskArticleText.upsert).toHaveBeenCalledWith({
      where: { articleId_locale: { articleId: 'a-1', locale: 'en' } },
      create: { articleId: 'a-1', locale: 'en', title: 'Hi', body: 'Text' },
      update: { title: 'Hi', body: 'Text' },
    });
  });

  it('writes an edit as one unit, so a text that fails leaves nothing half done', async () => {
    tx.helpdeskArticleText.upsert
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('value too long'));

    await expect(
      store.updateArticle('a-1', { position: 3 }, [
        { locale: 'es', title: 'Hola', body: 'Texto' },
        { locale: 'en', title: 'Hi', body: 'Text' },
      ]),
    ).rejects.toThrow('value too long');

    // Every write went through the one transaction, which the failure
    // undoes; none went straight to the database.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.helpdeskArticle.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.helpdeskArticleText.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.helpdeskArticle.updateMany).not.toHaveBeenCalled();
    expect(prisma.helpdeskArticleText.upsert).not.toHaveBeenCalled();
  });

  it('writes no text of an article that is not of the organization', async () => {
    tx.helpdeskArticle.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await store.updateArticle('a-9', {}, [
        { locale: 'en', title: 'x', body: 'y' },
      ]),
    ).toBe(false);
    expect(tx.helpdeskArticleText.upsert).not.toHaveBeenCalled();
    // With nothing to change, only the moment is written.
    expect(
      Object.keys(tx.helpdeskArticle.updateMany.mock.calls[0][0].data),
    ).toEqual(['updatedAt']);
  });

  it('publishes and takes back only inside the organization, and dates the publishing', async () => {
    const moment = new Date('2026-09-01T00:00:00Z');

    expect(await store.setArticleStatus('a-1', 'PUBLISHED', moment)).toBe(true);
    expect(await store.setArticleStatus('a-1', 'DRAFT', moment)).toBe(true);
    prisma.helpdeskArticle.updateMany.mockResolvedValue({ count: 0 });
    expect(await store.setArticleStatus('a-9', 'PUBLISHED', moment)).toBe(
      false,
    );

    const [publish, takeBack] =
      prisma.helpdeskArticle.updateMany.mock.calls.map((c) => c[0]);
    expect(publish).toEqual({
      where: { id: 'a-1', organizationId: 'org-1' },
      data: { status: 'PUBLISHED', publishedAt: moment },
    });
    expect(takeBack.data).toEqual({ status: 'DRAFT' });
  });

  it('deletes only a draft of the organization', async () => {
    expect(await store.deleteDraftArticle('a-1')).toBe(true);
    prisma.helpdeskArticle.deleteMany.mockResolvedValue({ count: 0 });
    expect(await store.deleteDraftArticle('a-2')).toBe(false);

    expect(prisma.helpdeskArticle.deleteMany.mock.calls[0][0]).toEqual({
      where: { id: 'a-1', organizationId: 'org-1', status: 'DRAFT' },
    });
  });

  it('gives anyone only published articles of the organization, in the language asked for', async () => {
    await store.publishedArticles('es', {}, 20);

    const query = prisma.helpdeskArticle.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      organizationId: 'org-1',
      status: 'PUBLISHED',
      texts: { some: { locale: 'es' } },
    });
    expect(query.take).toBe(20);
    // The address, the topic and the title: not who wrote it, nor the counts.
    expect(query.select).toEqual({
      slug: true,
      topic: true,
      texts: { where: { locale: 'es' }, select: { title: true } },
    });
  });

  it('looks for words in the title and the body of that language, without minding capitals, inside a topic', async () => {
    await store.publishedArticles(
      'en',
      { search: 'refund', topic: 'PAYMENTS' },
      5,
    );

    expect(prisma.helpdeskArticle.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      status: 'PUBLISHED',
      topic: 'PAYMENTS',
      texts: {
        some: {
          locale: 'en',
          OR: [
            { title: { contains: 'refund', mode: 'insensitive' } },
            { body: { contains: 'refund', mode: 'insensitive' } },
          ],
        },
      },
    });
  });

  it('reads one published article by its address, with the text of one language and no more', async () => {
    await store.publishedArticle('hola', 'es');

    const query = prisma.helpdeskArticle.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({
      slug: 'hola',
      organizationId: 'org-1',
      status: 'PUBLISHED',
      texts: { some: { locale: 'es' } },
    });
    expect(Object.keys(query.select).sort()).toEqual([
      'slug',
      'texts',
      'topic',
      'updatedAt',
    ]);
  });

  it('counts a reader who found a published article useful, or not, in one statement', async () => {
    expect(await store.countArticleFeedback('hola', true)).toBe(true);
    expect(await store.countArticleFeedback('hola', false)).toBe(true);
    prisma.helpdeskArticle.updateMany.mockResolvedValue({ count: 0 });
    expect(await store.countArticleFeedback('draft', true)).toBe(false);

    const [yes, no] = prisma.helpdeskArticle.updateMany.mock.calls.map(
      (c) => c[0],
    );
    expect(yes).toEqual({
      where: { slug: 'hola', organizationId: 'org-1', status: 'PUBLISHED' },
      data: { usefulYes: { increment: 1 } },
    });
    expect(no.data).toEqual({ usefulNo: { increment: 1 } });
  });
});
