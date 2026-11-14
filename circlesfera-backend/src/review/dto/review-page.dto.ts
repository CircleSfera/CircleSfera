import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  REVIEW_ENFORCEMENT_KINDS,
  REVIEW_PAGE_MAX,
  type ReviewEnforcementKind,
} from '../review.constants.js';

export class ReviewPageDto {
  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: REVIEW_PAGE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REVIEW_PAGE_MAX)
  limit?: number;
}

export class ReviewEnforcementDto extends ReviewPageDto {
  @ApiProperty({ required: true, enum: REVIEW_ENFORCEMENT_KINDS })
  @IsIn(REVIEW_ENFORCEMENT_KINDS)
  kind!: ReviewEnforcementKind;
}
