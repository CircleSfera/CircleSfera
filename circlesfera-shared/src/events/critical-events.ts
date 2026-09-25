/**
 * Discriminated event contracts for governed EventEmitter2 domain events
 * (ADR-0019's closed category list). Provides strict compile-time type
 * safety across backend and shared consumers, and a single source of
 * truth for what each event's payload actually contains.
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

export interface SystemOperationalMetricsEvent {
  type: 'system.metrics.operational';
  payload: {
    timestamp: string;
    overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    queuesCount: number;
    totalWaitingJobs: number;
    totalFailedJobs: number;
    mediaBacklogStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    alertsCount: number;
  };
}

// Shared envelope for the realtime fan-out events emitted by chat use-cases
// and consumed by AppGateway: a list of participant profileIds to notify,
// plus the payload forwarded to each of their sockets.
export interface ChatFanoutEnvelope<TPayload> {
  participants: { profileId: string }[];
  payload: TPayload;
}

export interface ChatMessageSentEvent {
  type: 'chat.message.sent';
  payload: ChatFanoutEnvelope<{
    id: string;
    conversationId: string;
    senderId?: string;
    isLocked?: boolean;
    content?: string;
    tempId?: string;
    [key: string]: unknown;
  }>;
}

export interface ChatMessageDeletedEvent {
  type: 'chat.message.deleted';
  payload: ChatFanoutEnvelope<{ messageId: string }>;
}

export interface ChatMessageEditedEvent {
  type: 'chat.message.edited';
  payload: ChatFanoutEnvelope<{
    id: string;
    content: string;
    [key: string]: unknown;
  }>;
}

export interface ChatConversationUpdatedEvent {
  type: 'chat.conversation.updated';
  // The emitted payload is the full updated Conversation row (id, not
  // conversationId) — the listener forwards it to clients verbatim.
  payload: ChatFanoutEnvelope<{
    id: string;
    [key: string]: unknown;
  }>;
}

export interface ChatConversationDeletedEvent {
  type: 'chat.conversation.deleted';
  payload: ChatFanoutEnvelope<{ conversationId: string }>;
}

// Deliberately not a ChatFanoutEnvelope: this is the one chat.* event whose
// shape predates that convention (participants are nested under
// `conversation`, not a top-level `participants` array).
export interface ChatConversationCreatedEvent {
  type: 'chat.conversation.created';
  payload: {
    conversation: {
      id: string;
      participants: { profileId: string }[];
      [key: string]: unknown;
    };
  };
}

export interface ModerationReportFiledEvent {
  type: 'moderation.report_filed';
  payload: {
    reportId: string;
    reporterId: string;
    targetType: string;
    targetId: string;
    reason: string;
    details?: string;
  };
}

export interface PaymentAlertEvent {
  type: 'payment.alert';
  payload: {
    eventType: string;
    amount?: number;
    currency?: string;
    description?: string;
    userId?: string;
  };
}

// Mirrors the SupportTicket model's shape without depending on
// @prisma/client from this package.
export interface SupportTicketCreatedEvent {
  type: 'support.ticket_created';
  payload: {
    id: string;
    userId: string | null;
    email: string;
    subject: string;
    message: string;
    status: string;
    reply: string | null;
    resolvedAt: Date | string | null;
    createdAt: Date | string;
  };
}

export interface UserSessionTerminateEvent {
  type: 'user.session.terminate';
  payload: {
    userId: string;
    profileId?: string;
    reason?: string;
  };
}

export interface NotificationCreateEvent {
  type: 'notification.create';
  payload: {
    recipientId: string;
    senderId?: string;
    // Mirrors Prisma's NotificationType enum as a string to keep this
    // package independent of @prisma/client.
    type: string;
    content: string;
    postId?: string;
  };
}

/**
 * Discriminated union of all governed EventEmitter2 domain events.
 */
export type CriticalDomainEvent =
  | PaymentLiveGiftCompletedEvent
  | UserHardDeletedEvent
  | NotificationDispatchedEvent
  | MediaDeleteBatchEvent
  | SystemIncidentEvent
  | SystemOperationalMetricsEvent
  | ChatMessageSentEvent
  | ChatMessageDeletedEvent
  | ChatMessageEditedEvent
  | ChatConversationUpdatedEvent
  | ChatConversationDeletedEvent
  | ChatConversationCreatedEvent
  | ModerationReportFiledEvent
  | PaymentAlertEvent
  | SupportTicketCreatedEvent
  | UserSessionTerminateEvent
  | NotificationCreateEvent;

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

/**
 * The service responsible for each event's contract: for events with a
 * single canonical consumer, the listener that owns the business logic;
 * for fan-out events with several independent listeners (user.hard_deleted,
 * media.delete_batch), the emitter, since it is the unambiguous single
 * source of truth for the payload shape and when the event fires.
 */
export const EVENT_OWNERS: Record<CriticalEventType, string> = {
  'payment.live_gift_completed': 'LiveGiftService',
  'user.hard_deleted': 'AccountDeletionProcessor',
  'notification.dispatched': 'AppGateway',
  'media.delete_batch': 'AccountDeletionProcessor / UploadsService',
  'system.incident': 'SlackService',
  'system.metrics.operational': 'OperationalMetricsService',
  'chat.message.sent': 'AppGateway',
  'chat.message.deleted': 'AppGateway',
  'chat.message.edited': 'AppGateway',
  'chat.conversation.updated': 'AppGateway',
  'chat.conversation.deleted': 'AppGateway',
  'chat.conversation.created': 'AppGateway',
  'moderation.report_filed': 'SlackService',
  'payment.alert': 'SlackService',
  'support.ticket_created': 'SlackService',
  'user.session.terminate': 'AppGateway',
  'notification.create': 'NotificationsService',
};
