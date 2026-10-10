import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PLAN_FEATURE_KEYS,
  type PlanFeatureKey,
} from '../../common/constants/plan-features.constants.js';

/**
 * What staff can change in a platform plan. Price, currency, interval and
 * the Stripe identifiers are not here on purpose: Stripe is who charges.
 */
export class UpdatePlanDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PLAN_FEATURE_KEYS, { each: true })
  features?: PlanFeatureKey[];

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
