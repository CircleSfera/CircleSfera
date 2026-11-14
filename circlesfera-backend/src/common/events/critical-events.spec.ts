import {
  type CriticalDomainEvent,
  type CriticalEventPayload,
  type CriticalEventType,
  EVENT_OWNERS,
  isCriticalEvent,
} from '@circlesfera/shared';
import { describe, expect, it } from 'vitest';

describe('CriticalDomainEvent contracts', () => {
  it('correctly discriminates UserHardDeletedEvent', () => {
    const event: CriticalDomainEvent = {
      type: 'user.hard_deleted',
      payload: {
        userId: 'user-deleted-1',
        profileId: 'profile-1',
        profileIds: ['profile-1'],
        mediaUrls: ['https://cdn.example.com/media1.jpg'],
      },
    };

    expect(isCriticalEvent('user.hard_deleted', event)).toBe(true);
    expect(isCriticalEvent('payment.alert', event)).toBe(false);
    if (isCriticalEvent('user.hard_deleted', event)) {
      expect(event.payload.userId).toBe('user-deleted-1');
      expect(event.payload.profileIds).toHaveLength(1);
    }
  });

  it('correctly discriminates NotificationDispatchedEvent', () => {
    const event: CriticalDomainEvent = {
      type: 'notification.dispatched',
      payload: {
        recipientId: 'recipient-1',
        notification: {
          id: 'notif-1',
          type: 'LIKE',
          content: 'Someone liked your post',
          postId: 'post-1',
        },
      },
    };

    expect(isCriticalEvent('notification.dispatched', event)).toBe(true);
    if (isCriticalEvent('notification.dispatched', event)) {
      expect(event.payload.recipientId).toBe('recipient-1');
      expect(event.payload.notification.type).toBe('LIKE');
    }
  });

  it('enforces compile-time type safety on payload extractor', () => {
    type AlertPayload = CriticalEventPayload<'payment.alert'>;
    const samplePayload: AlertPayload = {
      eventType: 'Promotion Payment',
      amount: 1000,
      currency: 'eur',
      description: 'Promotion ID: promo-1',
    };

    expect(samplePayload.amount).toBe(1000);
  });

  it('correctly discriminates ModerationReportFiledEvent', () => {
    const event: CriticalDomainEvent = {
      type: 'moderation.report_filed',
      payload: {
        reportId: 'report-1',
        reporterId: 'reporter-1',
        targetType: 'POST',
        targetId: 'post-1',
        reason: 'SPAM',
      },
    };

    expect(isCriticalEvent('moderation.report_filed', event)).toBe(true);
    if (isCriticalEvent('moderation.report_filed', event)) {
      expect(event.payload.reportId).toBe('report-1');
    }
  });

  it('correctly discriminates the chat.conversation.updated fan-out envelope', () => {
    const event: CriticalDomainEvent = {
      type: 'chat.conversation.updated',
      payload: {
        participants: [{ profileId: 'p-1' }, { profileId: 'p-2' }],
        payload: { id: 'conv-1', name: 'Group' },
      },
    };

    expect(isCriticalEvent('chat.conversation.updated', event)).toBe(true);
    if (isCriticalEvent('chat.conversation.updated', event)) {
      expect(event.payload.participants).toHaveLength(2);
      expect(event.payload.payload.id).toBe('conv-1');
    }
  });

  it('declares an owner for every governed event type', () => {
    const criticalEventTypes: CriticalEventType[] = [
      'user.hard_deleted',
      'notification.dispatched',
      'system.incident',
      'system.metrics.operational',
      'chat.message.sent',
      'chat.message.deleted',
      'chat.message.edited',
      'chat.conversation.updated',
      'chat.conversation.deleted',
      'chat.conversation.created',
      'moderation.report_filed',
      'payment.alert',
      'support.ticket_created',
      'user.session.terminate',
      'notification.create',
    ];

    for (const type of criticalEventTypes) {
      expect(EVENT_OWNERS[type], `owner for ${type}`).toBeTruthy();
    }
  });
});
