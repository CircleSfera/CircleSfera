import { ApiProperty } from '@nestjs/swagger';
import { IllegalNoticeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NOTICE_PAGE_MAX } from '../illegal-notices.service.js';

export class IllegalNoticePageDto {
  @ApiProperty({ required: true, enum: ['ACTIONED', 'RECEIVED', 'NO_ACTION'] })
  @IsEnum(IllegalNoticeStatus)
  status!: IllegalNoticeStatus;

  @ApiProperty({ required: false, type: () => String, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: 1,
    maximum: NOTICE_PAGE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTICE_PAGE_MAX)
  limit?: number;
}
