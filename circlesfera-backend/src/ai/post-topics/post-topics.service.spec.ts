import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AIService } from '../ai.service.js';
import {
  EXCLUDED_SUBJECT_DESCRIPTIONS,
  POST_TOPIC_DESCRIPTIONS,
} from './post-topic-descriptions.js';
import {
  chooseTopic,
  MIN_TOPIC_SIMILARITY,
  PostTopicsService,
  parseVector,
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

// A post whose similarity to the anchor at `index` is exactly `similarity`,
// and about nothing else.
function postNear(index: number, similarity: number): number[] {
  const v = axis(NOWHERE).map((x) => x * Math.sqrt(1 - similarity ** 2));
  v[index] = similarity;
  return v;
}

const topicIndex = (topic: string) =>
  Object.keys(POST_TOPIC_DESCRIPTIONS).indexOf(topic);
const excludedIndex = (i: number) =>
  Object.keys(POST_TOPIC_DESCRIPTIONS).length + i;

function makeService(configured = true) {
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
      updateMany: vi.fn().mockImplementation(async ({ where }) => ({
        count: Array.isArray(where.id?.in) ? where.id.in.length : 1,
      })),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const service = new PostTopicsService(
    ai as unknown as AIService,
    prisma as unknown as PrismaService,
  );
  return { service, ai, prisma };
}

const asText = (v: number[]) => `[${v.join(',')}]`;

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
    // Near "music" too, but nearer to the excluded subject.
    expect(chooseTopic([0.6, 0, 0.8, 0], anchors)).toMatchObject({
      topic: 'other',
      reason: 'excluded_subject',
    });
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
      expect(await service.topicFor(postNear(topicIndex('travel'), 0.6))).toBe(
        'travel',
      );
      expect(await service.topicFor(postNear(topicIndex('gaming'), 0.6))).toBe(
        'gaming',
      );
      expect(ai.generateEmbeddings).toHaveBeenCalledTimes(1);
      expect(ai.generateEmbeddings).toHaveBeenCalledWith(ANCHOR_TEXTS);
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
    it('stores the topic of the embedding on the post', async () => {
      const { service, prisma } = makeService();
      await expect(
        service.assignFromEmbedding('post-1', axis(topicIndex('fashion'))),
      ).resolves.toBe('fashion');
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { topic: 'fashion' },
      });
    });

    it('stores `other` for a post about an excluded subject', async () => {
      const { service, prisma } = makeService();
      await service.assignFromEmbedding('post-1', axis(excludedIndex(0)));
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { topic: 'other' },
      });
    });

    it('never throws: a failure leaves the post to the sweep', async () => {
      const { service, ai, prisma } = makeService();
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
      const { service, prisma } = makeService(false);
      await expect(
        service.assignFromEmbedding('post-1', axis(0)),
      ).resolves.toBeNull();
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('sweep', () => {
    const rows = (n: number, start = 0) =>
      Array.from({ length: n }, (_, i) => ({
        postId: `p${String(start + i).padStart(3, '0')}`,
        vector: asText(axis(topicIndex('music'))),
      }));

    it('goes through the posts without a topic in pages, after the last id of each', async () => {
      const { service, prisma } = makeService();
      prisma.$queryRaw
        .mockResolvedValueOnce(rows(2, 0))
        .mockResolvedValueOnce(rows(2, 2))
        .mockResolvedValueOnce(rows(1, 4));

      const result = await service.sweep({
        batchSize: 2,
        maxPerRun: 100,
        pauseMs: 0,
      });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
      // Template values: the id to go on after, then the page size.
      expect(prisma.$queryRaw.mock.calls.map((c) => c.slice(1))).toEqual([
        ['', 2],
        ['p001', 2],
        ['p003', 2],
      ]);
      const sql = (prisma.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sql).toContain('p.topic IS NULL');
      expect(result).toMatchObject({
        scanned: 5,
        assigned: 5,
        byTopic: { music: 5 },
      });
    });

    it('stops at the most posts a run may take', async () => {
      const { service, prisma } = makeService();
      prisma.$queryRaw.mockImplementation(async (_s, _after, take) =>
        rows(take),
      );
      const result = await service.sweep({
        batchSize: 2,
        maxPerRun: 3,
        pauseMs: 1,
      });
      expect(prisma.$queryRaw.mock.calls.map((c) => c[2])).toEqual([2, 1]);
      expect(result.scanned).toBe(3);
    });

    it('only gives a topic to a post that still has none, so running it again changes nothing', async () => {
      const { service, prisma } = makeService();
      prisma.$queryRaw.mockResolvedValueOnce([
        { postId: 'a', vector: asText(axis(topicIndex('books'))) },
        { postId: 'b', vector: asText(postNear(topicIndex('books'), 0.1)) },
        { postId: 'c', vector: asText(axis(excludedIndex(2))) },
        { postId: 'd', vector: 'broken' },
      ]);

      const first = await service.sweep({
        batchSize: 10,
        maxPerRun: 100,
        pauseMs: 0,
      });

      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a'] }, topic: null },
        data: { topic: 'books' },
      });
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['b', 'c'] }, topic: null },
        data: { topic: 'other' },
      });
      expect(first).toEqual({
        scanned: 4,
        assigned: 3,
        belowThreshold: 1,
        excludedSubject: 1,
        byTopic: { books: 1, other: 2 },
      });

      // Every post has its topic now: the next run finds none.
      prisma.post.updateMany.mockClear();
      const second = await service.sweep();
      expect(second.scanned).toBe(0);
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing without a real AI model', async () => {
      const { service, prisma, ai } = makeService(false);
      expect((await service.sweep()).scanned).toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(ai.generateEmbeddings).not.toHaveBeenCalled();
    });

    it('fails, to be tried again, when the topics cannot be embedded', async () => {
      const { service, ai, prisma } = makeService();
      ai.generateEmbeddings.mockRejectedValueOnce(new Error('503'));
      await expect(service.sweep()).rejects.toThrow('503');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
