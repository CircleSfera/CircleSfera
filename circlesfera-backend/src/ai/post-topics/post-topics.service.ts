import { setTimeout as sleep } from 'node:timers/promises';
import { POST_TOPIC_FALLBACK, type PostTopic } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
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

// The sweep that gives a topic to the posts with an embedding and none yet
// (the posts from before topics, and any whose topic could not be given when
// it was embedded): pages of 100, a pause between pages, at most 1000 posts a
// run. It asks the AI provider for nothing per post: the vectors are stored.
export const TOPIC_SWEEP = {
  batchSize: 100,
  maxPerRun: 1000,
  pauseMs: 250,
} as const;

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

// The topic of a post from its embedding: the nearest anchor's, if it is a
// topic and near enough; `other` when nothing is near enough, or when the
// nearest is an excluded subject.
export function chooseTopic(
  vector: number[],
  anchors: TopicAnchor[],
  minSimilarity: number = MIN_TOPIC_SIMILARITY,
): TopicChoice {
  let best: TopicAnchor | null = null;
  let bestSimilarity = Number.NEGATIVE_INFINITY;
  for (const anchor of anchors) {
    const similarity = cosineSimilarity(vector, anchor.vector);
    if (similarity > bestSimilarity) {
      best = anchor;
      bestSimilarity = similarity;
    }
  }
  if (!best || bestSimilarity < minSimilarity) {
    return {
      topic: POST_TOPIC_FALLBACK,
      reason: 'below_threshold',
      similarity: bestSimilarity,
    };
  }
  if (best.topic === null) {
    return {
      topic: POST_TOPIC_FALLBACK,
      reason: 'excluded_subject',
      similarity: bestSimilarity,
    };
  }
  return { topic: best.topic, reason: 'match', similarity: bestSimilarity };
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

  // Gives a topic to the posts that have an embedding and no topic, in pages
  // (see TOPIC_SWEEP). Safe to run again at any time and to stop halfway:
  // a post is chosen only while it has no topic, and keeps the one it gets.
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
      byTopic: {},
    };
    if (!this.ai.isConfigured()) return result;
    const anchors = await this.topicAnchors();

    let afterId = '';
    while (result.scanned < options.maxPerRun) {
      const take = Math.min(
        options.batchSize,
        options.maxPerRun - result.scanned,
      );
      const rows = await this.prisma.$queryRaw<
        { postId: string; vector: string }[]
      >`
        SELECT pe."postId", pe.vector::text AS vector
        FROM post_embeddings pe
        JOIN posts p ON p.id = pe."postId"
        WHERE p.topic IS NULL AND pe."postId" > ${afterId}
        ORDER BY pe."postId"
        LIMIT ${take}
      `;
      if (rows.length === 0) break;
      result.scanned += rows.length;
      afterId = rows[rows.length - 1].postId;

      const postsByTopic = new Map<PostTopic, string[]>();
      for (const row of rows) {
        const vector = parseVector(row.vector);
        if (!vector) continue;
        const choice = chooseTopic(vector, anchors);
        if (choice.reason === 'below_threshold') result.belowThreshold++;
        if (choice.reason === 'excluded_subject') result.excludedSubject++;
        const ids = postsByTopic.get(choice.topic) ?? [];
        ids.push(row.postId);
        postsByTopic.set(choice.topic, ids);
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

      if (rows.length < take) break;
      if (options.pauseMs > 0) await sleep(options.pauseMs);
    }

    if (result.scanned > 0) {
      this.logger.log(
        `Topics given to ${result.assigned} of ${result.scanned} posts (below the threshold: ${result.belowThreshold}, on an excluded subject: ${result.excludedSubject}): ${JSON.stringify(result.byTopic)}`,
      );
    }
    return result;
  }
}
