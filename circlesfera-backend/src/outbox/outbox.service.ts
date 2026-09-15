import { getQueueToken } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EnqueueOutboxEventDto,
  OUTBOX_BATCH_SIZE,
  OUTBOX_LEASE_DURATION_MS,
  OUTBOX_MAX_RETRIES,
  OutboxDelegate,
} from './outbox.constants.js';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly queueCache = new Map<string, Queue>();
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get outboxDelegate(): OutboxDelegate {
    return (this.prisma as any).outboxEvent;
  }

  /**
   * Enqueues an outbox event within an existing Prisma transaction.
   * Both business data and outbox event commit or rollback together.
   */
  async enqueue(tx: Prisma.TransactionClient, data: EnqueueOutboxEventDto) {
    if (!data.queueName || !data.eventName) {
      throw new Error('Outbox event requires queueName and eventName');
    }

    const txDelegate = (tx as any)?.outboxEvent as OutboxDelegate | undefined;
    if (!txDelegate || typeof txDelegate.create !== 'function') {
      this.logger.warn(
        `Outbox delegate not available on transaction client; skipping outbox write for "${data.eventName}".`,
      );
      return null;
    }

    return txDelegate.create({
      data: {
        queueName: data.queueName,
        eventName: data.eventName,
        payload: (data.payload ?? {}) as unknown as Record<string, unknown>,
        options: (data.options ?? null) as unknown as Record<string, unknown>,
        status: 'PENDING',
      },
    });
  }

  /**
   * Resolves and caches a BullMQ Queue instance by its queue name.
   */
  resolveQueue(queueName: string): Queue | null {
    if (this.queueCache.has(queueName)) {
      return this.queueCache.get(queueName)!;
    }

    try {
      const queueToken = getQueueToken(queueName);
      const queue = this.moduleRef.get<Queue>(queueToken, { strict: false });
      if (queue && typeof queue.add === 'function') {
        this.queueCache.set(queueName, queue);
        return queue;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to resolve queue "${queueName}" from ModuleRef: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return null;
  }

  /**
   * Sweeps pending or stuck outbox events, claims them atomically,
   * and publishes them to the respective BullMQ queues.
   */
  async publishPendingEvents(
    limit = OUTBOX_BATCH_SIZE,
  ): Promise<{ published: number; failed: number; skipped: number }> {
    if (this.isSweeping) {
      return { published: 0, failed: 0, skipped: 0 };
    }

    this.isSweeping = true;
    let published = 0;
    let failed = 0;
    let skipped = 0;

    const delegate = this.outboxDelegate;
    if (!delegate || typeof delegate.findMany !== 'function') {
      this.isSweeping = false;
      return { published: 0, failed: 0, skipped: 0 };
    }

    try {
      const now = new Date();
      const leaseCutoff = new Date(now.getTime() - OUTBOX_LEASE_DURATION_MS);

      // Find candidates: PENDING or stuck PROCESSING events whose lease has expired
      const candidates = await delegate.findMany({
        where: {
          OR: [
            { status: 'PENDING' },
            {
              status: 'PROCESSING',
              updatedAt: { lte: leaseCutoff },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      for (const event of candidates) {
        // Atomically claim the event with lease semantics
        const claim = await this.outboxDelegate.updateMany({
          where: {
            id: event.id,
            status: event.status,
            updatedAt: event.updatedAt,
          },
          data: {
            status: 'PROCESSING',
            updatedAt: now,
          },
        });

        if (claim.count === 0) {
          // Claim lost to concurrent publisher
          skipped++;
          continue;
        }

        try {
          const queue = this.resolveQueue(event.queueName);
          if (!queue) {
            throw new Error(
              `BullMQ Queue "${event.queueName}" is not registered or available in the application.`,
            );
          }

          const rawOptions = (event.options as Record<string, unknown>) || {};
          const deterministicJobId =
            (rawOptions.jobId as string) || `outbox:${event.id}`;

          await queue.add(event.eventName, event.payload, {
            ...rawOptions,
            jobId: deterministicJobId,
          });

          await delegate.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              updatedAt: new Date(),
            },
          });

          published++;
        } catch (publishErr) {
          const nextRetry = event.retryCount + 1;
          const isFinalFailure = nextRetry >= OUTBOX_MAX_RETRIES;
          const errorMessage =
            publishErr instanceof Error
              ? publishErr.message
              : String(publishErr);

          this.logger.error(
            `Failed to publish outbox event ${event.id} (attempt ${nextRetry}/${OUTBOX_MAX_RETRIES}): ${errorMessage}`,
          );

          await this.outboxDelegate.update({
            where: { id: event.id },
            data: {
              status: isFinalFailure ? 'FAILED' : 'PENDING',
              retryCount: nextRetry,
              lastError: errorMessage,
              updatedAt: new Date(),
            },
          });

          failed++;
        }
      }
    } catch (err) {
      this.logger.error(
        `Outbox sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.isSweeping = false;
    }

    return { published, failed, skipped };
  }

  /**
   * Asynchronously triggers an immediate publish cycle for sub-second delivery
   * right after transaction commit.
   */
  triggerImmediatePublish(): void {
    setImmediate(() => {
      this.publishPendingEvents().catch((err) => {
        this.logger.warn(
          `Immediate outbox flush error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    });
  }

  /**
   * Background reconciliation cron running every 5 seconds to guarantee
   * durability and recovery from process crashes or queue downtime.
   */
  @Cron('*/5 * * * * *')
  async handleCronSweep(): Promise<void> {
    await this.publishPendingEvents();
  }
}
