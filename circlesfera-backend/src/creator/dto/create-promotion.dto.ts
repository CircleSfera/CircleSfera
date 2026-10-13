import { Transform } from 'class-transformer';
import {
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
  @ValidateIf((dto: CreatePromotionDto) => dto.dailyBudget === undefined)
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

  @IsOptional()
  @IsString()
  @MaxLength(50)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  interests?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  countries?: string;
}
