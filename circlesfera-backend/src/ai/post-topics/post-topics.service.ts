import { setTimeout as sleep } from 'node:timers/promises';
import { POST_TOPIC_FALLBACK, type PostTopic } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AIService } from '../ai.service.js';
import {
  EXCLUDED_SUBJECT_DESCRIPTIONS,
  POST_TOPIC_DESCRIPTIONS,
} from './post-topic-descriptions.js';

// How near (cosine similarity) a post's embedding must be to a topic's
// description to be given that topic; below it the post gets `other`. With
// text-embedding-3-small, texts on unrelated subjects score about 0 to 0.15
// and a caption on a description's subject about 0.3 and up: 0.25 keeps a
// caption with no clear subject ("good morning", emojis) out of every topic
// rather than give it the least distant one. Each sweep logs how many fell
// below it, to tune it on real posts.
export const MIN_TOPIC_SIMILARITY = 0.25;

// How much nearer than every excluded subject the best topic must be. A post
// about as near to an excluded subject (health, say) as to a topic (family
// and parenting) is taken to be about the excluded subject: it gets `other`.
export const EXCLUDED_SUBJECT_MARGIN = 0.05;

// The sweep that gives a topic to the posts with none yet: those from before
// topics, those whose topic could not be given when they were embedded, and
// those with no words. Pages of 100, a pause between pages, at most 1000
// posts a run. It asks the AI provider for nothing per post.
export const TOPIC_SWEEP = {
  batchSize: 100,
  maxPerRun: 1000,
  pauseMs: 250,
} as const;

// Where the sweep goes on from in its next run: the last post id it read.
// Without it every run would start again at the first post with no topic,
// and posts still waiting for their embedding would be read again each time.
export const TOPIC_SWEEP_CURSOR_KEY = 'post-topics:sweep:after';
const TOPIC_SWEEP_CURSOR_TTL_SECONDS = 7 * 24 * 60 * 60;

// A vector a post's embedding is compared with: a topic's description, or
// one of the excluded subjects (topic null).
export interface TopicAnchor {
  topic: Exclude<PostTopic, 'other'> | null;
  vector: number[];
}

export type TopicReason = 'match' | 'below_threshold' | 'excluded_subject';

export interface TopicChoice {
  topic: PostTopic;
  reason: TopicReason;
  similarity: number;
}

export interface TopicSweepResult {
  scanned: number;
  assigned: number;
  belowThreshold: number;
  excludedSubject: number;
  withoutWords: number;
  waitingForEmbedding: number;
  byTopic: Partial<Record<PostTopic, number>>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.NaN;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// The topic of a post from its embedding: the nearest topic's, if it is near
// enough and clearly nearer than every excluded subject; `other` otherwise.
export function chooseTopic(
  vector: number[],
  anchors: TopicAnchor[],
  minSimilarity: number = MIN_TOPIC_SIMILARITY,
  margin: number = EXCLUDED_SUBJECT_MARGIN,
): TopicChoice {
  let bestTopic: Exclude<PostTopic, 'other'> | null = null;
  let bestTopicSimilarity = Number.NEGATIVE_INFINITY;
  let bestExcludedSimilarity = Number.NEGATIVE_INFINITY;
  for (const anchor of anchors) {
    const similarity = cosineSimilarity(vector, anchor.vector);
    if (anchor.topic === null) {
      if (similarity > bestExcludedSimilarity) {
        bestExcludedSimilarity = similarity;
      }
    } else if (similarity > bestTopicSimilarity) {
      bestTopic = anchor.topic;
      bestTopicSimilarity = similarity;
    }
  }
  if (!bestTopic || bestTopicSimilarity < minSimilarity) {
    return {
      topic: POST_TOPIC_FALLBACK,
      reason: 'below_threshold',
      similarity: bestTopicSimilarity,
    };
  }
  if (bestTopicSimilarity - bestExcludedSimilarity < margin) {
    return {
      topic: POST_TOPIC_FALLBACK,
      reason: 'excluded_subject',
      similarity: bestTopicSimilarity,
    };
  }
  return { topic: bestTopic, reason: 'match', similarity: bestTopicSimilarity };
}

// A pgvector value as PostgreSQL writes it ("[0.1,0.2,...]"), or null.
export function parseVector(text: string): number[] | null {
  try {
    const value: unknown = JSON.parse(text);
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((n) => typeof n === 'number')
    ) {
      return value as number[];
    }
  } catch {
    // Not a vector: the caller skips the post.
  }
  return null;
}

// Gives each post or Frame the topic its embedding is nearest to (PD-084).
// The topics are never shown and no public response carries them.
@Injectable()
export class PostTopicsService {
  private readonly logger = new Logger(PostTopicsService.name);
  // The topics' and excluded subjects' vectors: embedded once per process,
  // in one request, and kept.
  private anchors: Promise<TopicAnchor[]> | null = null;

  constructor(
    @Inject(AIService) private readonly ai: AIService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private topicAnchors(): Promise<TopicAnchor[]> {
    if (!this.anchors) {
      const entries: { topic: TopicAnchor['topic']; text: string }[] = [
        ...(
          Object.entries(POST_TOPIC_DESCRIPTIONS) as [
            Exclude<PostTopic, 'other'>,
            string,
          ][]
        ).map(([topic, text]) => ({ topic, text })),
        ...EXCLUDED_SUBJECT_DESCRIPTIONS.map((text) => ({ topic: null, text })),
      ];
      const loading = this.ai
        .generateEmbeddings(entries.map((entry) => entry.text))
        .then((vectors) => {
          if (vectors.length !== entries.length) {
            throw new Error(
              `Expected ${entries.length} topic vectors, got ${vectors.length}`,
            );
          }
          return entries.map((entry, i) => ({
            topic: entry.topic,
            vector: vectors[i],
          }));
        });
      // A failure is not kept: the next post asks again.
      loading.catch(() => {
        if (this.anchors === loading) this.anchors = null;
      });
      this.anchors = loading;
    }
    return this.anchors;
  }

  // The topic for an embedding, or null without a real AI model: a made-up
  // vector would give a made-up topic, so the post waits for a real one.
  async topicFor(vector: number[]): Promise<PostTopic | null> {
    if (!this.ai.isConfigured()) return null;
    return chooseTopic(vector, await this.topicAnchors()).topic;
  }

  // Gives a post the topic of the embedding just made for it. It never fails
  // the embedding: a topic that cannot be given now is given by the sweep.
  async assignFromEmbedding(
    postId: string,
    vector: number[],
  ): Promise<PostTopic | null> {
    try {
      const topic = await this.topicFor(vector);
      if (!topic) return null;
      await this.prisma.post.updateMany({
        where: { id: postId },
        data: { topic },
      });
      return topic;
    } catch (error: unknown) {
      this.logger.warn(
        `No topic for post ${postId} yet, the sweep gives it: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  // A post with no words has nothing to tell what it is about: `other`.
  async assignWithoutWords(postId: string): Promise<void> {
    await this.prisma.post.updateMany({
      where: { id: postId },
      data: { topic: POST_TOPIC_FALLBACK },
    });
  }

  private async readCursor(): Promise<string> {
    try {
      return (await this.redis.get(TOPIC_SWEEP_CURSOR_KEY)) ?? '';
    } catch {
      return '';
    }
  }

  private async writeCursor(afterId: string | null): Promise<void> {
    try {
      if (afterId === null) await this.redis.del(TOPIC_SWEEP_CURSOR_KEY);
      else
        await this.redis.set(
          TOPIC_SWEEP_CURSOR_KEY,
          afterId,
          'EX',
          TOPIC_SWEEP_CURSOR_TTL_SECONDS,
        );
    } catch {
      // Lost: the next run starts again at the first post, nothing worse.
    }
  }

  // Gives a topic to the posts with none, in pages (see TOPIC_SWEEP), going
  // on from where the last run stopped and starting again at the first once
  // it reaches the last. It reads only posts with no topic (a partial index
  // holds just those), so once every post has one a run costs next to
  // nothing. Safe to stop halfway and to run again: a post is written only
  // while it has no topic.
  async sweep(
    options: {
      batchSize: number;
      maxPerRun: number;
      pauseMs: number;
    } = TOPIC_SWEEP,
  ): Promise<TopicSweepResult> {
    const result: TopicSweepResult = {
      scanned: 0,
      assigned: 0,
      belowThreshold: 0,
      excludedSubject: 0,
      withoutWords: 0,
      waitingForEmbedding: 0,
      byTopic: {},
    };
    if (!this.ai.isConfigured()) return result;
    const anchors = await this.topicAnchors();

    let afterId = await this.readCursor();
    let reachedEnd = false;
    while (result.scanned < options.maxPerRun) {
      const take = Math.min(
        options.batchSize,
        options.maxPerRun - result.scanned,
      );
      const rows = await this.prisma.$queryRaw<
        { postId: string; vector: string | null; hasWords: boolean }[]
      >`
        SELECT p.id AS "postId",
               pe.vector::text AS vector,
               COALESCE(btrim(p.caption), '') <> '' AS "hasWords"
        FROM posts p
        LEFT JOIN post_embeddings pe ON pe."postId" = p.id
        WHERE p.topic IS NULL AND p.id > ${afterId}
        ORDER BY p.id
        LIMIT ${take}
      `;
      if (rows.length > 0) {
        result.scanned += rows.length;
        afterId = rows[rows.length - 1].postId;
        await this.assignPage(rows, anchors, result);
      }
      if (rows.length < take) {
        reachedEnd = true;
        break;
      }
      await this.writeCursor(afterId);
      if (options.pauseMs > 0) await sleep(options.pauseMs);
    }
    await this.writeCursor(reachedEnd ? null : afterId);

    if (result.scanned > 0) {
      this.logger.log(
        `Topics given to ${result.assigned} of ${result.scanned} posts (below the threshold: ${result.belowThreshold}, near an excluded subject: ${result.excludedSubject}, no words: ${result.withoutWords}, waiting for an embedding: ${result.waitingForEmbedding}): ${JSON.stringify(result.byTopic)}`,
      );
    }
    return result;
  }

  private async assignPage(
    rows: { postId: string; vector: string | null; hasWords: boolean }[],
    anchors: TopicAnchor[],
    result: TopicSweepResult,
  ): Promise<void> {
    const postsByTopic = new Map<PostTopic, string[]>();
    for (const row of rows) {
      let topic: PostTopic;
      if (row.vector !== null) {
        const vector = parseVector(row.vector);
        if (!vector) continue;
        const choice = chooseTopic(vector, anchors);
        if (choice.reason === 'below_threshold') result.belowThreshold++;
        if (choice.reason === 'excluded_subject') result.excludedSubject++;
        topic = choice.topic;
      } else if (!row.hasWords) {
        result.withoutWords++;
        topic = POST_TOPIC_FALLBACK;
      } else {
        // Its embedding is still to be made: its job gives the topic.
        result.waitingForEmbedding++;
        continue;
      }
      const ids = postsByTopic.get(topic) ?? [];
      ids.push(row.postId);
      postsByTopic.set(topic, ids);
    }

    for (const [topic, ids] of postsByTopic) {
      // Only while it has none: a topic given meanwhile is kept.
      const { count } = await this.prisma.post.updateMany({
        where: { id: { in: ids }, topic: null },
        data: { topic },
      });
      result.assigned += count;
      result.byTopic[topic] = (result.byTopic[topic] ?? 0) + count;
    }
  }
}
