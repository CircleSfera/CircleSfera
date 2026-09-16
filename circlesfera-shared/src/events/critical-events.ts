/**
 * Discriminated event contracts for critical platform events.
 * Provides strict compile-time type safety across backend and shared consumers.
 */

export interface PaymentLiveGiftCompletedEvent {
  type: 'payment.live_gift_completed';
  payload: {
    liveGiftId: string;
    senderId: string;
    streamId: string;
    giftId: string;
    creatorId: string;
    amountCents: number;
    currency: string;
    paymentIntentId: string;
  };
}

export interface PaymentPromotionCompletedEvent {
  type: 'payment.promotion_completed';
  payload: {
    promotionId: string;
    userId: string;
    amountCents: number;
    currency: string;
    stripePaymentIntentId: string;
  };
}

export interface UserHardDeletedEvent {
  type: 'user.hard_deleted';
  payload: {
    userId: string;
    profileId?: string;
    profileIds: string[];
    mediaUrls?: string[];
  };
}

export interface NotificationDispatchedEvent {
  type: 'notification.dispatched';
  payload: {
    recipientId: string;
    notification: {
      id: string;
      type: string;
      content: string;
      postId?: string | null;
      commentId?: string | null;
      senderId?: string | null;
      createdAt?: Date | string;
    };
  };
}

export interface MediaDeleteBatchEvent {
  type: 'media.delete_batch';
  payload: {
    urls: string[];
  };
}

export interface SystemIncidentEvent {
  type: 'system.incident';
  payload: {
    message: string;
    stack?: string;
    path?: string;
    method?: string;
    statusCode?: number;
    timestamp?: string;
    correlationId?: string;
  };
}

/**
 * Discriminated union of all critical domain events in the system.
 */
export type CriticalDomainEvent =
  | PaymentLiveGiftCompletedEvent
  | PaymentPromotionCompletedEvent
  | UserHardDeletedEvent
  | NotificationDispatchedEvent
  | MediaDeleteBatchEvent
  | SystemIncidentEvent;

export type CriticalEventType = CriticalDomainEvent['type'];

/**
 * Extract the payload type for a specific critical event type.
 */
export type CriticalEventPayload<T extends CriticalEventType> = Extract<
  CriticalDomainEvent,
  { type: T }
>['payload'];

/**
 * Type guard for critical domain events.
 */
export function isCriticalEvent<T extends CriticalEventType>(
  type: T,
  event: { type: string; payload?: unknown },
): event is Extract<CriticalDomainEvent, { type: T }> {
  return event.type === type;
}
