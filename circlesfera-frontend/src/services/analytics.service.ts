import { apiClient } from './api';

class AnalyticsService {
  private eventQueue: Array<{
    eventType: string;
    targetId: string;
    targetType: string;
    dwellTime: number;
  }> = [];

  private flushInterval: number | ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  constructor() {
    this.startAutoFlush();

    // Flush when user leaves the page
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushSync();
      });
    }
  }

  public queueDwellTimeEvent(postId: string, dwellTime: number) {
    this.eventQueue.push({
      eventType: 'DWELL_TIME',
      targetId: postId,
      targetType: 'POST',
      dwellTime,
    });

    if (this.eventQueue.length >= 10) {
      this.flush(); // Flush early if queue gets large
    }
  }

  private startAutoFlush() {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5000); // Flush every 5 seconds
  }

  private async flush() {
    if (this.eventQueue.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const eventsToSend = [...this.eventQueue];
    this.eventQueue = []; // Clear current queue

    try {
      await apiClient.post('/analytics/batch', {
        events: eventsToSend,
      });
    } catch (error) {
      console.error('Failed to flush analytics events', error);
      // Re-queue events if failed (optional, but good for resilience)
      this.eventQueue = [...eventsToSend, ...this.eventQueue];
    } finally {
      this.isFlushing = false;
    }
  }

  private flushSync() {
    if (this.eventQueue.length === 0) return;

    // Use navigator.sendBeacon for reliable delivery on page unload if possible
    try {
      const url = `${apiClient.defaults.baseURL}/analytics/batch`;
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ events: this.eventQueue })], {
          type: 'application/json',
        });
        navigator.sendBeacon(url, blob);
      } else {
        // Fallback (might be cancelled by browser)
        apiClient.post('/analytics/batch', { events: this.eventQueue });
      }
    } catch (e) {
      console.warn('Sync flush failed:', e);
    }

    this.eventQueue = [];
  }
}

export const analyticsApi = new AnalyticsService();
