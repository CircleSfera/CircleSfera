import { COUNTRY_CODES } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
} from 'class-validator';
import {
  PROMOTION_DAILY_BUDGETS_EUROS,
  PROMOTION_DURATIONS_DAYS,
} from '../../common/constants/promotion.constants.js';

// The countries come in the query as one list separated by commas.
const countryList = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean)
    : value;

/** The choices a promotion is bought with, to estimate its reach. */
export class EstimatePromotionReachDto {
  @ApiProperty({ required: true, enum: PROMOTION_DAILY_BUDGETS_EUROS })
  @Type(() => Number)
  @IsIn(PROMOTION_DAILY_BUDGETS_EUROS)
  dailyBudget!: number;

  @ApiProperty({ required: true, enum: PROMOTION_DURATIONS_DAYS })
  @Type(() => Number)
  @IsIn(PROMOTION_DURATIONS_DAYS)
  durationDays!: number;

  // Countries separated by commas, from the closed list; none for everywhere.
  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @Transform(countryList)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(COUNTRY_CODES.length)
  @IsIn(COUNTRY_CODES, { each: true })
  countries?: string[];
}
