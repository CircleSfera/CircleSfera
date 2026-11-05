import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  REVIEW_ENFORCEMENT_KINDS,
  REVIEW_PAGE_MAX,
  REVIEW_PAID_KINDS,
  type ReviewEnforcementKind,
  type ReviewPaidKind,
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

export class ReviewPaidContentDto extends ReviewPageDto {
  @ApiProperty({ required: false, enum: REVIEW_PAID_KINDS })
  @IsOptional()
  @IsIn(REVIEW_PAID_KINDS)
  kind?: ReviewPaidKind;
}

export class ReviewEnforcementDto extends ReviewPageDto {
  @ApiProperty({ required: true, enum: REVIEW_ENFORCEMENT_KINDS })
  @IsIn(REVIEW_ENFORCEMENT_KINDS)
  kind!: ReviewEnforcementKind;
}
