import { COUNTRY_CODES } from '@circlesfera/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PROMOTION_DAILY_BUDGETS_EUROS,
  PROMOTION_DURATIONS_DAYS,
} from '../../common/constants/monetization.constants.js';

// What can be promoted: only what a feed shows as promoted.
export const PROMOTION_TARGETS = ['post', 'frame'] as const;

const lowerCase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value;
const upperCase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;
const upperCaseEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.toUpperCase() : v))
    : value;

export class CreatePromotionDto {
  @Transform(lowerCase)
  @IsIn(PROMOTION_TARGETS)
  targetType!: (typeof PROMOTION_TARGETS)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId!: string;

  // One of the fixed lengths and budgets per day; the server works out the
  // whole budget, the amount charged.
  @IsIn(PROMOTION_DURATIONS_DAYS)
  durationDays!: number;

  @IsIn(PROMOTION_DAILY_BUDGETS_EUROS)
  dailyBudget!: number;

  @IsOptional()
  @Transform(upperCase)
  @IsIn(['EUR'])
  currency?: string;

  // Countries the promotion is aimed at, from the closed list; none for
  // everywhere.
  @IsOptional()
  @Transform(upperCaseEach)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(COUNTRY_CODES.length)
  @IsIn(COUNTRY_CODES, { each: true })
  countries?: string[];

  // The buyer consents to start at once and acknowledges losing the right of
  // withdrawal; without it the purchase is refused.
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}

export class UpdatePromotionDto {
  @IsOptional()
  @Transform(upperCaseEach)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(COUNTRY_CODES.length)
  @IsIn(COUNTRY_CODES, { each: true })
  countries?: string[];

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(PROMOTION_DAILY_BUDGETS_EUROS)
  dailyBudget?: number;
}
