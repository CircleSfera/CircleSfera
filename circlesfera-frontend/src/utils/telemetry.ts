import { apiClient } from '../services/api';

export type UserEventType =
  | 'IMPRESSION'
  | 'VIEW_START'
  | 'VIEW_COMPLETE'
  | 'DWELL_TIME'
  | 'LIKE'
  | 'COMMENT'
  | 'SAVE'
  | 'SHARE'
  | 'HIDE'
  | 'REPORT'
  | 'PROFILE_CLICK'
  | 'FOLLOW'
  | 'SUBSCRIPTION_CLICK'
  | 'SUBSCRIPTION_SUCCESS'
  | 'SPONSORED_PLACEMENT_CLICK';

export interface TelemetryEvent {
  eventType: UserEventType;
  targetId: string;
  targetType: 'POST' | 'STORY' | 'USER' | 'PROMOTION';
  dwellTime?: number;
}

class TelemetryManager {
  private queue: TelemetryEvent[] = [];
  private timer: number | null = null;
  private batchInterval = 5000;
  private maxBatchSize = 10;

  track(event: TelemetryEvent) {
    this.queue.push(event);

    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    } else if (this.timer === null) {
      this.timer = window.setTimeout(() => this.flush(), this.batchInterval);
    }
  }

  async flush() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) return;

    const eventsToSend = [...this.queue];
    this.queue = [];

    try {
      await apiClient.post('/analytics/events/batch', { events: eventsToSend });
    } catch (err) {
      console.error('Failed to send telemetry batch:', err);
      // Restore failed events to the queue
      this.queue = [...eventsToSend, ...this.queue].slice(0, 100); // Limit queue size to avoid overflow
    }
  }
}

export const telemetry = new TelemetryManager();
