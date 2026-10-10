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
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsUUID()
  planId?: string;

  // Username or email of the holder.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
