import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AdminSubscriptionsQueryDto extends PaginationDto {
  @ApiProperty({
    required: false,
    enum: [
      'ACTIVE',
      'CANCELLED',
      'TRIALING',
      'PAST_DUE',
      'INCOMPLETE',
      'EXPIRED',
    ],
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  planId?: string;

  // Username or email of the holder.
  @ApiProperty({ required: false, type: () => String, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
