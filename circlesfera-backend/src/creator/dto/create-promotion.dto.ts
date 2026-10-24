import { COUNTRY_CODES } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ required: true, enum: PROMOTION_TARGETS })
  @Transform(lowerCase)
  @IsIn(PROMOTION_TARGETS)
  targetType!: (typeof PROMOTION_TARGETS)[number];

  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId!: string;

  // One of the fixed lengths and budgets per day; the server works out the
  // whole budget, the amount charged.
  @ApiProperty({
    required: true,
    type: () => Number,
    enum: PROMOTION_DURATIONS_DAYS,
  })
  @IsIn(PROMOTION_DURATIONS_DAYS)
  durationDays!: number;

  @ApiProperty({
    required: true,
    type: () => Number,
    enum: PROMOTION_DAILY_BUDGETS_EUROS,
  })
  @IsIn(PROMOTION_DAILY_BUDGETS_EUROS)
  dailyBudget!: number;

  @ApiProperty({ required: false, type: () => String, enum: ['EUR'] })
  @IsOptional()
  @Transform(upperCase)
  @IsIn(['EUR'])
  currency?: string;

  // Countries the promotion is aimed at, from the closed list; none for
  // everywhere.
  @ApiProperty({
    required: false,
    type: () => [String],
    enum: COUNTRY_CODES,
    isArray: true,
    uniqueItems: true,
    maxItems: COUNTRY_CODES.length,
  })
  @IsOptional()
  @Transform(upperCaseEach)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(COUNTRY_CODES.length)
  @IsIn(COUNTRY_CODES, { each: true })
  countries?: string[];

  // The buyer consents to start at once and acknowledges losing the right of
  // withdrawal; without it the purchase is refused.
  @ApiProperty({ required: true, type: () => Boolean })
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}

export class UpdatePromotionDto {
  @ApiProperty({
    required: false,
    type: () => [String],
    enum: COUNTRY_CODES,
    isArray: true,
    uniqueItems: true,
    maxItems: COUNTRY_CODES.length,
  })
  @IsOptional()
  @Transform(upperCaseEach)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(COUNTRY_CODES.length)
  @IsIn(COUNTRY_CODES, { each: true })
  countries?: string[];

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    required: false,
    type: () => Number,
    enum: PROMOTION_DAILY_BUDGETS_EUROS,
  })
  @IsOptional()
  @IsIn(PROMOTION_DAILY_BUDGETS_EUROS)
  dailyBudget?: number;
}
