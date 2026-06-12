import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PLAN_KEY = 'requires-plan';
export const RequiresPlan = (planName: string) =>
  SetMetadata(REQUIRES_PLAN_KEY, planName);
