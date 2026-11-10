import { ApiProperty } from '@nestjs/swagger';
import { MonetizationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ListMonetizationApplicationsDto {
  @ApiProperty({ enum: MonetizationStatus, required: false })
  @IsOptional()
  @IsEnum(MonetizationStatus)
  status?: MonetizationStatus;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class MonetizationDecisionDto {
  // Shown to the creator; needed to refuse or revoke.
  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
