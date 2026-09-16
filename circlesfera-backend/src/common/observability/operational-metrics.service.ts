import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { SocketPresenceService } from '../../socket/services/socket-presence.service.js';

export interface MetricThresholds {
  queueWaitingWarn: number;
  queueWaitingAlert: number;
  queueFailedWarn: number;
  queueFailedAlert: number;
  jobAgeWarnMs: number;
  jobAgeAlertMs: number;
  mediaBacklogWarn: number;
  mediaBacklogAlert: number;
}

export const DEFAULT_OPERATIONAL_THRESHOLDS: MetricThresholds = {
  queueWaitingWarn: 100,
  queueWaitingAlert: 500,
  queueFailedWarn: 10,
  queueFailedAlert: 50,
  jobAgeWarnMs: 60_000, // 1 minute
  jobAgeAlertMs: 300_000, // 5 minutes
  mediaBacklogWarn: 20,
  mediaBacklogAlert: 100,
};

export interface QueueOperationalMetric {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  oldestJobAgeMs: number;
  isStalled: boolean;
}

export interface MediaOperationalMetric {
  transcodingQueueDepth: number;
  transcodingActive: number;
  transcodingFailed: number;
  oldestTranscodeAgeMs: number;
  backlogStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
}

export interface RealtimeOperationalMetric {
  onlineUsersCount: number;
  status: 'HEALTHY' | 'DEGRADED';
}

export interface ThresholdAlert {
  component: 'queue' | 'media' | 'realtime';
  identifier: string;
  metric: string;
  threshold: number;
  actual: number;
  severity: 'WARN' | 'ALERT';
  message: string;
}

export interface OperationalMetricsSnapshot {
  timestamp: string;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  queues: QueueOperationalMetric[];
  media: MediaOperationalMetric;
  realtime: RealtimeOperationalMetric;
  alerts: ThresholdAlert[];
}

@Injectable()
export class OperationalMetricsService {
  private readonly logger = new Logger(OperationalMetricsService.name);
  private thresholds: MetricThresholds = { ...DEFAULT_OPERATIONAL_THRESHOLDS };

  constructor(
    @Optional()
    @Inject(EventEmitter2)
    private readonly eventEmitter?: EventEmitter2,
    @Optional()
    @Inject(SocketPresenceService)
    private readonly socketPresenceService?: SocketPresenceService,
    @Optional()
    @InjectQueue('video-transcoding')
    private readonly videoQueue?: Queue,
    @Optional()
    @InjectQueue('notifications-processing')
    private readonly notificationsQueue?: Queue,
    @Optional()
    @InjectQueue('chat-processing')
    private readonly chatQueue?: Queue,
    @Optional()
    @InjectQueue('feed-fanout')
    private readonly feedFanoutQueue?: Queue,
    @Optional()
    @InjectQueue('users-processing')
    private readonly usersQueue?: Queue,
    @Optional()
    @InjectQueue('analytics-processing')
    private readonly analyticsQueue?: Queue,
    @Optional()
    @InjectQueue('ai-processing')
    private readonly aiQueue?: Queue,
  ) {}

  /**
   * Configures custom operational alert thresholds.
   */
  setThresholds(customThresholds: Partial<MetricThresholds>): void {
    this.thresholds = { ...this.thresholds, ...customThresholds };
  }

  getThresholds(): MetricThresholds {
    return { ...this.thresholds };
  }

  private getTrackedQueues(): Queue[] {
    return [
      this.videoQueue,
      this.notificationsQueue,
      this.chatQueue,
      this.feedFanoutQueue,
      this.usersQueue,
      this.analyticsQueue,
      this.aiQueue,
    ].filter((q): q is Queue => Boolean(q));
  }

  /**
   * Collects an exhaustive operational metrics snapshot across queues, media processing, and realtime.
   */
  async collectMetrics(): Promise<OperationalMetricsSnapshot> {
    const alerts: ThresholdAlert[] = [];
    const queues = this.getTrackedQueues();
    const queueMetrics: QueueOperationalMetric[] = [];

    for (const queue of queues) {
      try {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'failed',
          'delayed',
        );
        const waiting = counts.waiting ?? 0;
        const active = counts.active ?? 0;
        const failed = counts.failed ?? 0;
        const delayed = counts.delayed ?? 0;

        let oldestJobAgeMs = 0;
        if (waiting > 0) {
          const oldestJobs = await queue.getJobs(['waiting'], 0, 0);
          if (oldestJobs.length > 0 && oldestJobs[0].timestamp) {
            oldestJobAgeMs = Math.max(0, Date.now() - oldestJobs[0].timestamp);
          }
        }

        const isStalled =
          oldestJobAgeMs > this.thresholds.jobAgeAlertMs && active === 0;

        queueMetrics.push({
          name: queue.name,
          waiting,
          active,
          failed,
          delayed,
          oldestJobAgeMs,
          isStalled,
        });

        // Queue waiting depth threshold check
        if (waiting >= this.thresholds.queueWaitingAlert) {
          alerts.push({
            component: 'queue',
            identifier: queue.name,
            metric: 'waiting',
            threshold: this.thresholds.queueWaitingAlert,
            actual: waiting,
            severity: 'ALERT',
            message: `Queue [${queue.name}] backlog critical: ${waiting} jobs waiting.`,
          });
        } else if (waiting >= this.thresholds.queueWaitingWarn) {
          alerts.push({
            component: 'queue',
            identifier: queue.name,
            metric: 'waiting',
            threshold: this.thresholds.queueWaitingWarn,
            actual: waiting,
            severity: 'WARN',
            message: `Queue [${queue.name}] backlog high: ${waiting} jobs waiting.`,
          });
        }

        // Queue failed jobs threshold check
        if (failed >= this.thresholds.queueFailedAlert) {
          alerts.push({
            component: 'queue',
            identifier: queue.name,
            metric: 'failed',
            threshold: this.thresholds.queueFailedAlert,
            actual: failed,
            severity: 'ALERT',
            message: `Queue [${queue.name}] excessive failures: ${failed} failed jobs.`,
          });
        } else if (failed >= this.thresholds.queueFailedWarn) {
          alerts.push({
            component: 'queue',
            identifier: queue.name,
            metric: 'failed',
            threshold: this.thresholds.queueFailedWarn,
            actual: failed,
            severity: 'WARN',
            message: `Queue [${queue.name}] elevated failures: ${failed} failed jobs.`,
          });
        }

        // Job age threshold check
        if (oldestJobAgeMs >= this.thresholds.jobAgeAlertMs) {
          alerts.push({
            component: 'queue',
            identifier: queue.name,
            metric: 'oldestJobAgeMs',
            threshold: this.thresholds.jobAgeAlertMs,
            actual: oldestJobAgeMs,
            severity: 'ALERT',
            message: `Queue [${queue.name}] latency alert: oldest job age ${Math.round(oldestJobAgeMs / 1000)}s.`,
          });
        } else if (oldestJobAgeMs >= this.thresholds.jobAgeWarnMs) {
          alerts.push({
            component: 'queue',
            identifier: queue.name,
            metric: 'oldestJobAgeMs',
            threshold: this.thresholds.jobAgeWarnMs,
            actual: oldestJobAgeMs,
            severity: 'WARN',
            message: `Queue [${queue.name}] latency warning: oldest job age ${Math.round(oldestJobAgeMs / 1000)}s.`,
          });
        }
      } catch (err) {
        this.logger.error(
          `Failed to collect metrics for queue [${queue.name}]`,
          err,
        );
      }
    }

    // Media processing metrics
    const videoMetric = queueMetrics.find(
      (q) => q.name === 'video-transcoding',
    );
    const transcodingQueueDepth = videoMetric?.waiting ?? 0;
    const transcodingActive = videoMetric?.active ?? 0;
    const transcodingFailed = videoMetric?.failed ?? 0;
    const oldestTranscodeAgeMs = videoMetric?.oldestJobAgeMs ?? 0;

    let mediaBacklogStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    if (transcodingQueueDepth >= this.thresholds.mediaBacklogAlert) {
      mediaBacklogStatus = 'CRITICAL';
      alerts.push({
        component: 'media',
        identifier: 'video-transcoding',
        metric: 'transcodingQueueDepth',
        threshold: this.thresholds.mediaBacklogAlert,
        actual: transcodingQueueDepth,
        severity: 'ALERT',
        message: `Media transcoding backlog critical: ${transcodingQueueDepth} video jobs waiting.`,
      });
    } else if (transcodingQueueDepth >= this.thresholds.mediaBacklogWarn) {
      mediaBacklogStatus = 'DEGRADED';
      alerts.push({
        component: 'media',
        identifier: 'video-transcoding',
        metric: 'transcodingQueueDepth',
        threshold: this.thresholds.mediaBacklogWarn,
        actual: transcodingQueueDepth,
        severity: 'WARN',
        message: `Media transcoding backlog elevated: ${transcodingQueueDepth} video jobs waiting.`,
      });
    }

    const media: MediaOperationalMetric = {
      transcodingQueueDepth,
      transcodingActive,
      transcodingFailed,
      oldestTranscodeAgeMs,
      backlogStatus: mediaBacklogStatus,
    };

    // Realtime metrics
    let onlineUsersCount = 0;
    let realtimeStatus: 'HEALTHY' | 'DEGRADED' = 'HEALTHY';
    try {
      if (this.socketPresenceService) {
        onlineUsersCount =
          await this.socketPresenceService.getOnlineUsersCount();
      }
    } catch (err) {
      this.logger.warn('Failed to read online users presence metrics', err);
      realtimeStatus = 'DEGRADED';
    }

    const realtime: RealtimeOperationalMetric = {
      onlineUsersCount,
      status: realtimeStatus,
    };

    // Derive overall system operational status
    const hasCriticalAlert = alerts.some((a) => a.severity === 'ALERT');
    const hasWarnAlert = alerts.some((a) => a.severity === 'WARN');
    const overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = hasCriticalAlert
      ? 'CRITICAL'
      : hasWarnAlert || realtimeStatus === 'DEGRADED'
        ? 'DEGRADED'
        : 'HEALTHY';

    const snapshot: OperationalMetricsSnapshot = {
      timestamp: new Date().toISOString(),
      overallStatus,
      queues: queueMetrics,
      media,
      realtime,
      alerts,
    };

    // Emit operational metrics event
    this.eventEmitter?.emit('system.metrics.operational', {
      timestamp: snapshot.timestamp,
      overallStatus: snapshot.overallStatus,
      queuesCount: queueMetrics.length,
      totalWaitingJobs: queueMetrics.reduce((acc, q) => acc + q.waiting, 0),
      totalFailedJobs: queueMetrics.reduce((acc, q) => acc + q.failed, 0),
      mediaBacklogStatus: snapshot.media.backlogStatus,
      alertsCount: alerts.length,
    });

    // Escalate critical threshold violations to incident channel
    if (hasCriticalAlert) {
      const criticalMessages = alerts
        .filter((a) => a.severity === 'ALERT')
        .map((a) => a.message)
        .join('; ');

      this.eventEmitter?.emit('system.incident', {
        message: `[Operational Alert] System degraded: ${criticalMessages}`,
        statusCode: 503,
        path: 'operational://metrics',
        timestamp: snapshot.timestamp,
      });
    }

    return snapshot;
  }

  /**
   * Periodic evaluation of operational metrics scheduled every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateOperationalMetricsCron(): Promise<void> {
    try {
      await this.collectMetrics();
    } catch (err) {
      this.logger.error(
        'Error during scheduled operational metrics evaluation',
        err,
      );
    }
  }
}
