import {
  type CriticalDomainEvent,
  type CriticalEventPayload,
  type CriticalEventType,
  EVENT_OWNERS,
  isCriticalEvent,
} from '@circlesfera/shared';
import { describe, expect, it } from 'vitest';

describe('CriticalDomainEvent contracts', () => {
  it('correctly discriminates and guards PaymentLiveGiftCompletedEvent', () => {
    const event: CriticalDomainEvent = {
      type: 'payment.live_gift_completed',
      payload: {
        liveGiftId: 'gift-1',
        senderId: 'user-sender',
        streamId: 'stream-1',
        giftId: 'rose',
        creatorId: 'creator-1',
        amountCents: 500,
        currency: 'EUR',
        paymentIntentId: 'pi_test_123',
      },
    };

    expect(isCriticalEvent('payment.live_gift_completed', event)).toBe(true);
    expect(isCriticalEvent('user.hard_deleted', event)).toBe(false);

    if (isCriticalEvent('payment.live_gift_completed', event)) {
      expect(event.payload.amountCents).toBe(500);
      expect(event.payload.currency).toBe('EUR');
    }
  });

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

  it('correctly discriminates MediaDeleteBatchEvent', () => {
    const event: CriticalDomainEvent = {
      type: 'media.delete_batch',
      payload: {
        urls: [
          'https://cdn.example.com/img1.png',
          'https://cdn.example.com/img2.png',
        ],
      },
    };

    expect(isCriticalEvent('media.delete_batch', event)).toBe(true);
    if (isCriticalEvent('media.delete_batch', event)) {
      expect(event.payload.urls).toHaveLength(2);
    }
  });

  it('enforces compile-time type safety on payload extractor', () => {
    type LiveGiftPayload = CriticalEventPayload<'payment.live_gift_completed'>;
    const samplePayload: LiveGiftPayload = {
      liveGiftId: 'gift-1',
      senderId: 'sender-1',
      streamId: 'stream-1',
      giftId: 'diamond',
      creatorId: 'creator-1',
      amountCents: 1000,
      currency: 'USD',
      paymentIntentId: 'pi_abc',
    };

    expect(samplePayload.amountCents).toBe(1000);
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
      'payment.live_gift_completed',
      'user.hard_deleted',
      'notification.dispatched',
      'media.delete_batch',
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
