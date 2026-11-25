import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AIService } from '../ai.service.js';
import {
  EXCLUDED_SUBJECT_DESCRIPTIONS,
  POST_TOPIC_DESCRIPTIONS,
} from './post-topic-descriptions.js';
import {
  chooseTopic,
  EXCLUDED_SUBJECT_MARGIN,
  MIN_TOPIC_SIMILARITY,
  PostTopicsService,
  parseVector,
  TOPIC_SWEEP_CURSOR_KEY,
  type TopicAnchor,
} from './post-topics.service.js';

// The anchors the service embeds, in its order: the topics, then the
// excluded subjects. In these tests each gets its own axis, and one more axis
// is left for "about nothing in particular".
const ANCHOR_TEXTS = [
  ...Object.values(POST_TOPIC_DESCRIPTIONS),
  ...EXCLUDED_SUBJECT_DESCRIPTIONS,
];
const DIMENSIONS = ANCHOR_TEXTS.length + 1;
const NOWHERE = ANCHOR_TEXTS.length;

function axis(index: number): number[] {
  return Array.from({ length: DIMENSIONS }, (_, i) => (i === index ? 1 : 0));
}

// A post whose similarity to each anchor given is exactly the one given, and
// about nothing else.
function postNear(similarities: Record<number, number>): number[] {
  const v = Array.from({ length: DIMENSIONS }, () => 0);
  let rest = 1;
  for (const [index, similarity] of Object.entries(similarities)) {
    v[Number(index)] = similarity;
    rest -= similarity ** 2;
  }
  v[NOWHERE] = Math.sqrt(rest);
  return v;
}

const topicIndex = (topic: string) =>
  Object.keys(POST_TOPIC_DESCRIPTIONS).indexOf(topic);
const excludedIndex = (subject: RegExp) =>
  Object.keys(POST_TOPIC_DESCRIPTIONS).length +
  EXCLUDED_SUBJECT_DESCRIPTIONS.findIndex((d) => subject.test(d));
const HEALTH = excludedIndex(/^Salud/);
const POLITICS = excludedIndex(/^Política/);

const asText = (v: number[]) => `[${v.join(',')}]`;

interface StoredPost {
  topic: string | null;
  caption: string;
  vector: string | null;
}

// The posts, their embeddings and Redis, kept in memory and read and written
// as the queries the service sends would read and write them.
function makeService(
  configured = true,
  posts: Record<string, StoredPost> = {},
) {
  const store = new Map(Object.entries(posts));
  const ai = {
    isConfigured: vi.fn().mockReturnValue(configured),
    generateEmbeddings: vi
      .fn()
      .mockImplementation(async (texts: string[]) =>
        texts.map((text) => axis(ANCHOR_TEXTS.indexOf(text))),
      ),
  };
  const prisma = {
    post: {
      updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
        const ids: string[] =
          typeof where.id === 'string' ? [where.id] : where.id.in;
        let count = 0;
        for (const id of ids) {
          const post = store.get(id);
          if (!post) continue;
          if ('topic' in where && post.topic !== where.topic) continue;
          post.topic = data.topic;
          count++;
        }
        return { count };
      }),
    },
    // posts LEFT JOIN post_embeddings WHERE topic IS NULL AND id > $1
    // ORDER BY id LIMIT $2
    $queryRaw: vi
      .fn()
      .mockImplementation(async (_sql, afterId: string, take: number) =>
        [...store.entries()]
          .filter(([id, post]) => post.topic === null && id > afterId)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .slice(0, take)
          .map(([id, post]) => ({
            postId: id,
            vector: post.vector,
            hasWords: post.caption.trim() !== '',
          })),
      ),
  };
  const kept = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => kept.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      kept.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (kept.delete(key) ? 1 : 0)),
  };
  const service = new PostTopicsService(
    ai as unknown as AIService,
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
  );
  return { service, ai, prisma, redis, store, kept };
}

// `n` posts with a caption about music, named p000, p001...
function musicPosts(n: number): Record<string, StoredPost> {
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `p${String(i).padStart(3, '0')}`,
      {
        topic: null,
        caption: 'concierto',
        vector: asText(axis(topicIndex('music'))),
      },
    ]),
  );
}

describe('chooseTopic', () => {
  const anchors: TopicAnchor[] = [
    { topic: 'music', vector: [1, 0, 0, 0] },
    { topic: 'sports', vector: [0, 1, 0, 0] },
    { topic: null, vector: [0, 0, 1, 0] },
  ];

  it('gives the nearest topic', () => {
    expect(chooseTopic([0.9, 0.3, 0, 0.1], anchors)).toMatchObject({
      topic: 'music',
      reason: 'match',
    });
    expect(chooseTopic([0.2, 0.8, 0.1, 0.1], anchors).topic).toBe('sports');
  });

  it('gives `other` when even the nearest is below the threshold', () => {
    const s = MIN_TOPIC_SIMILARITY - 0.01;
    const vector = [s, 0, 0, Math.sqrt(1 - s ** 2)];
    expect(chooseTopic(vector, anchors)).toMatchObject({
      topic: 'other',
      reason: 'below_threshold',
    });
    const t = MIN_TOPIC_SIMILARITY + 0.01;
    expect(chooseTopic([t, 0, 0, Math.sqrt(1 - t ** 2)], anchors).topic).toBe(
      'music',
    );
  });

  it('gives `other`, never a topic, when the nearest is an excluded subject', () => {
    expect(chooseTopic([0.6, 0, 0.8, 0], anchors)).toMatchObject({
      topic: 'other',
      reason: 'excluded_subject',
    });
  });

  it('gives `other` when a topic is nearest but an excluded subject is within the margin', () => {
    const near = (t: number, e: number) => [
      t,
      0,
      e,
      Math.sqrt(1 - t ** 2 - e ** 2),
    ];
    const close = 0.6 - EXCLUDED_SUBJECT_MARGIN + 0.01;
    expect(chooseTopic(near(0.6, close), anchors)).toMatchObject({
      topic: 'other',
      reason: 'excluded_subject',
    });
    const clear = 0.6 - EXCLUDED_SUBJECT_MARGIN - 0.01;
    expect(chooseTopic(near(0.6, clear), anchors).topic).toBe('music');
  });

  it('gives `other` for a vector that cannot be compared', () => {
    expect(chooseTopic([1, 0], anchors).topic).toBe('other');
    expect(chooseTopic([1, 0, 0, 0], []).topic).toBe('other');
  });
});

describe('parseVector', () => {
  it('reads a pgvector value and refuses anything else', () => {
    expect(parseVector('[0.5,-1,2e-3]')).toEqual([0.5, -1, 0.002]);
    expect(parseVector('[]')).toBeNull();
    expect(parseVector('["a"]')).toBeNull();
    expect(parseVector('not a vector')).toBeNull();
  });
});

describe('PostTopicsService', () => {
  describe('topicFor', () => {
    it('embeds the topics once and keeps them for every later post', async () => {
      const { service, ai } = makeService();
      expect(
        await service.topicFor(postNear({ [topicIndex('travel')]: 0.6 })),
      ).toBe('travel');
      expect(
        await service.topicFor(postNear({ [topicIndex('gaming')]: 0.6 })),
      ).toBe('gaming');
      expect(ai.generateEmbeddings).toHaveBeenCalledTimes(1);
      expect(ai.generateEmbeddings).toHaveBeenCalledWith(ANCHOR_TEXTS);
    });

    it('a post between family and health is taken to be about health: `other`', async () => {
      const { service } = makeService();
      const parenting = topicIndex('parenting');
      expect(
        await service.topicFor(postNear({ [parenting]: 0.6, [HEALTH]: 0.58 })),
      ).toBe('other');
      expect(
        await service.topicFor(postNear({ [parenting]: 0.6, [HEALTH]: 0.4 })),
      ).toBe('parenting');
    });

    it('asks again after a failure instead of keeping it', async () => {
      const { service, ai } = makeService();
      ai.generateEmbeddings.mockRejectedValueOnce(new Error('429'));
      await expect(service.topicFor(axis(0))).rejects.toThrow('429');
      expect(await service.topicFor(axis(topicIndex('music')))).toBe('music');
      expect(ai.generateEmbeddings).toHaveBeenCalledTimes(2);
    });

    it('refuses vectors that do not match the topics asked for', async () => {
      const { service, ai } = makeService();
      ai.generateEmbeddings.mockResolvedValueOnce([axis(0)]);
      await expect(service.topicFor(axis(0))).rejects.toThrow(
        /Expected \d+ topic vectors, got 1/,
      );
    });

    it('gives none without a real AI model, and asks it nothing', async () => {
      const { service, ai } = makeService(false);
      expect(await service.topicFor(axis(0))).toBeNull();
      expect(ai.generateEmbeddings).not.toHaveBeenCalled();
    });
  });

  describe('assignFromEmbedding', () => {
    const post = (): Record<string, StoredPost> => ({
      'post-1': { topic: null, caption: 'x', vector: null },
    });

    it('stores the topic of the embedding on the post', async () => {
      const { service, store } = makeService(true, post());
      await expect(
        service.assignFromEmbedding('post-1', axis(topicIndex('fashion'))),
      ).resolves.toBe('fashion');
      expect(store.get('post-1')?.topic).toBe('fashion');
    });

    it('stores `other` for a post about an excluded subject', async () => {
      const { service, store } = makeService(true, post());
      await service.assignFromEmbedding('post-1', axis(POLITICS));
      expect(store.get('post-1')?.topic).toBe('other');
    });

    it('never throws: a failure leaves the post to the sweep', async () => {
      const { service, ai, prisma } = makeService(true, post());
      ai.generateEmbeddings.mockRejectedValueOnce(new Error('down'));
      await expect(
        service.assignFromEmbedding('post-1', axis(0)),
      ).resolves.toBeNull();
      prisma.post.updateMany.mockRejectedValueOnce('db gone');
      await expect(
        service.assignFromEmbedding('post-1', axis(0)),
      ).resolves.toBeNull();
    });

    it('stores nothing without a real AI model', async () => {
      const { service, prisma } = makeService(false, post());
      await expect(
        service.assignFromEmbedding('post-1', axis(0)),
      ).resolves.toBeNull();
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('assignWithoutWords', () => {
    it('gives `other` to a post with no words, whatever it had', async () => {
      const { service, store } = makeService(true, {
        'post-1': { topic: 'music', caption: '', vector: null },
      });
      await service.assignWithoutWords('post-1');
      expect(store.get('post-1')?.topic).toBe('other');
    });
  });

  describe('sweep', () => {
    const run = { batchSize: 2, maxPerRun: 100, pauseMs: 0 };

    it('reads only posts with no topic, in pages after the last id of each', async () => {
      const { service, prisma, store } = makeService(true, {
        ...musicPosts(5),
        done: { topic: 'travel', caption: 'x', vector: null },
      });

      const result = await service.sweep(run);

      // Template values: the id to go on after, then the page size.
      expect(prisma.$queryRaw.mock.calls.map((c) => c.slice(1))).toEqual([
        ['', 2],
        ['p001', 2],
        ['p003', 2],
      ]);
      const sql = (prisma.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sql).toContain('WHERE p.topic IS NULL AND p.id > ?');
      expect(sql).toContain('LEFT JOIN post_embeddings');
      expect(result).toMatchObject({
        scanned: 5,
        assigned: 5,
        byTopic: { music: 5 },
      });
      expect(store.get('done')?.topic).toBe('travel');
    });

    it('stops at the most posts a run may take, and the next run goes on from there', async () => {
      const { service, prisma, kept, redis } = makeService(true, musicPosts(5));

      const first = await service.sweep({ ...run, maxPerRun: 3, pauseMs: 1 });
      expect(first.scanned).toBe(3);
      expect(prisma.$queryRaw.mock.calls.map((c) => c.slice(1))).toEqual([
        ['', 2],
        ['p001', 1],
      ]);
      expect(kept.get(TOPIC_SWEEP_CURSOR_KEY)).toBe('p002');
      expect(redis.set).toHaveBeenCalledWith(
        TOPIC_SWEEP_CURSOR_KEY,
        'p002',
        'EX',
        expect.any(Number),
      );

      prisma.$queryRaw.mockClear();
      const second = await service.sweep({ ...run, maxPerRun: 3 });
      expect(prisma.$queryRaw.mock.calls[0].slice(1)).toEqual(['p002', 2]);
      expect(second.scanned).toBe(2);
      // It reached the last post: the next run starts again at the first.
      expect(kept.has(TOPIC_SWEEP_CURSOR_KEY)).toBe(false);
    });

    it('never reads a post again once it has its topic: a second run changes nothing', async () => {
      const { service, prisma, store } = makeService(true, {
        a: {
          topic: null,
          caption: 'x',
          vector: asText(axis(topicIndex('books'))),
        },
        b: {
          topic: null,
          caption: 'x',
          vector: asText(postNear({ [topicIndex('books')]: 0.1 })),
        },
        c: {
          topic: null,
          caption: 'x',
          vector: asText(
            postNear({ [topicIndex('books')]: 0.5, [POLITICS]: 0.8 }),
          ),
        },
        d: { topic: null, caption: '   ', vector: null },
        e: { topic: null, caption: 'waiting for its embedding', vector: null },
        f: { topic: null, caption: 'x', vector: 'broken' },
      });

      const first = await service.sweep({ ...run, batchSize: 10 });
      expect(first).toEqual({
        scanned: 6,
        assigned: 4,
        belowThreshold: 1,
        excludedSubject: 1,
        withoutWords: 1,
        waitingForEmbedding: 1,
        byTopic: { books: 1, other: 3 },
      });
      const after = Object.fromEntries(
        [...store].map(([id, p]) => [id, p.topic]),
      );
      expect(after).toEqual({
        a: 'books',
        b: 'other',
        c: 'other',
        d: 'other',
        e: null,
        f: null,
      });

      prisma.post.updateMany.mockClear();
      const second = await service.sweep({ ...run, batchSize: 10 });
      // Only the two it cannot give a topic to yet are read again.
      expect(second).toMatchObject({ scanned: 2, assigned: 0 });
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
      expect(
        Object.fromEntries([...store].map(([id, p]) => [id, p.topic])),
      ).toEqual(after);
    });

    it('keeps a topic given between its read and its write', async () => {
      const { service, prisma, store } = makeService(true, musicPosts(2));
      const read = prisma.$queryRaw.getMockImplementation();
      prisma.$queryRaw.mockImplementationOnce(async (...args: unknown[]) => {
        const rows = await read?.(...args);
        // Its own embedding job gave it a topic meanwhile.
        const post = store.get('p000');
        if (post) post.topic = 'comedy';
        return rows;
      });

      const result = await service.sweep(run);
      expect(store.get('p000')?.topic).toBe('comedy');
      expect(store.get('p001')?.topic).toBe('music');
      expect(result.assigned).toBe(1);
    });

    it('starts at the first post when Redis cannot be read or written', async () => {
      const { service, prisma, redis } = makeService(true, musicPosts(1));
      redis.get.mockRejectedValueOnce(new Error('down'));
      redis.del.mockRejectedValueOnce(new Error('down'));
      const result = await service.sweep(run);
      expect(prisma.$queryRaw.mock.calls[0].slice(1)).toEqual(['', 2]);
      expect(result.assigned).toBe(1);
    });

    it('does nothing without a real AI model', async () => {
      const { service, prisma, ai } = makeService(false, musicPosts(1));
      expect((await service.sweep()).scanned).toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(ai.generateEmbeddings).not.toHaveBeenCalled();
    });

    it('fails, to be tried again, when the topics cannot be embedded', async () => {
      const { service, ai, prisma } = makeService(true, musicPosts(1));
      ai.generateEmbeddings.mockRejectedValueOnce(new Error('503'));
      await expect(service.sweep()).rejects.toThrow('503');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
