import { SetMetadata } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const REQUIRE_OWNERSHIP_KEY = 'requireOwnership';

export type OwnershipModelName =
  | 'Post'
  | 'Comment'
  | 'Story'
  | 'Highlight'
  | 'DataExportRequest'
  | 'SupportTicket'
  | 'Notification'
  | 'Profile'
  | 'User'
  | 'Collection'
  | 'Message';

export interface RequireOwnershipOptions {
  model: OwnershipModelName | Prisma.ModelName;
  paramKey?: string; // Default to 'id'
  userIdField?: string; // Custom owner field on resource (e.g. 'profileId', 'userId', 'id')
}

// Decorator that marks a route to check ownership of a specific model.
// The OwnershipGuard will fetch the model by paramKey and verify ownership against the authenticated user.
export const RequireOwnership = (options: RequireOwnershipOptions) =>
  SetMetadata(REQUIRE_OWNERSHIP_KEY, options);
