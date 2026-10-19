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
  @IsEnum(IllegalNoticeStatus)
  status!: IllegalNoticeStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTICE_PAGE_MAX)
  limit?: number;
}
