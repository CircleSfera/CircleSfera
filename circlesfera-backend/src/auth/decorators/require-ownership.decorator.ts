import { SetMetadata } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const REQUIRE_OWNERSHIP_KEY = 'requireOwnership';

export interface RequireOwnershipOptions {
  model: Prisma.ModelName;
  paramKey?: string; // default to 'id'
  userIdField?: string; // default to 'userId'
}

/**
 * Decorator that marks a route to check ownership of a specific model.
 * The OwnershipGuard will fetch the model by paramKey and check if userIdField matches the current user.
 */
export const RequireOwnership = (options: RequireOwnershipOptions) =>
  SetMetadata(REQUIRE_OWNERSHIP_KEY, options);
