import { SetMetadata } from '@nestjs/common';
import type { ProfileActivityAction } from '@prisma/client';

export const RECORDS_ACTIVITY = 'team:recordsActivity';

// The action a route takes on content of the session's Profile. On a
// Business Profile it is recorded with the person who did it (ADR-0028).
export const RecordsActivity = (action: ProfileActivityAction) =>
  SetMetadata(RECORDS_ACTIVITY, action);
