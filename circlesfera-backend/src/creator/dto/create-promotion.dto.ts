import { COUNTRY_CODES } from '@circlesfera/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MAX_PROMOTION_BUDGET_EUROS,
  MAX_PROMOTION_DAILY_BUDGET_EUROS,
  MAX_PROMOTION_DAYS,
  MIN_PROMOTION_BUDGET_EUROS,
  MIN_PROMOTION_DAILY_BUDGET_EUROS,
  MIN_PROMOTION_DAYS,
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

  @IsInt()
  @Min(MIN_PROMOTION_DAYS)
  @Max(MAX_PROMOTION_DAYS)
  durationDays!: number;

  // The whole budget, in euros. Either this or the budget per day is sent.
  // Checked whenever it is sent: it is the amount that is charged.
  @ValidateIf(
    (dto: CreatePromotionDto) =>
      dto.budget !== undefined || dto.dailyBudget === undefined,
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_PROMOTION_BUDGET_EUROS)
  @Max(MAX_PROMOTION_BUDGET_EUROS)
  budget?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_PROMOTION_DAILY_BUDGET_EUROS)
  @Max(MAX_PROMOTION_DAILY_BUDGET_EUROS)
  dailyBudget?: number;

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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_PROMOTION_DAILY_BUDGET_EUROS)
  @Max(MAX_PROMOTION_DAILY_BUDGET_EUROS)
  dailyBudget?: number;
}
