import {
  type CriticalDomainEvent,
  type CriticalEventPayload,
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
});
