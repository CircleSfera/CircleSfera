// Prisma enums in circlesfera-backend/prisma/schema.prisma are canonical for the backend.

export enum ReportStatus {
  PENDING = 'PENDING',
  REVIEWING = 'REVIEWING',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

export enum PostType {
  POST = 'POST',
  FRAME = 'FRAME',
}

export enum NotificationType {
  LIKE = 'LIKE',
  COMMENT = 'COMMENT',
  FOLLOW = 'FOLLOW',
  FOLLOW_REQUEST = 'FOLLOW_REQUEST',
  FOLLOW_ACCEPTED = 'FOLLOW_ACCEPTED',
  MENTION = 'MENTION',
  COMMENT_LIKE = 'COMMENT_LIKE',
  MODERATION = 'MODERATION',
  SUBSCRIPTION = 'SUBSCRIPTION',
  MESSAGE = 'MESSAGE',
  REPLY_MESSAGE = 'REPLY_MESSAGE',
}

export enum ReportReason {
  SPAM = 'SPAM',
  HARASSMENT = 'HARASSMENT',
  ILLEGAL_CONTENT = 'ILLEGAL_CONTENT',
  VIOLENCE = 'VIOLENCE',
  HATE_SPEECH = 'HATE_SPEECH',
  IMPERSONATION = 'IMPERSONATION',
  CSAM = 'CSAM',
  SCAM = 'SCAM',
  OTHER = 'OTHER',
}

export enum ReportTargetType {
  USER = 'USER',
  POST = 'POST',
  STORY = 'STORY',
  COMMENT = 'COMMENT',
  MESSAGE = 'MESSAGE',
}
