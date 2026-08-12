import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AdminQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** Filter content lists by author / host user id. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  @IsIn(['verified', 'pending', 'not_started'])
  kycStatus?: string;

  @IsOptional()
  @IsString()
  @IsIn(['POST', 'FRAME', 'STORY', 'COMMENT'])
  type?: string;

  @IsOptional()
  @IsString()
  moderationStatus?: string;

  /** AdminAuditLog.action filter (e.g. BAN_USER). */
  @IsOptional()
  @IsString()
  action?: string;

  /** ISO date string — inclusive lower bound for createdAt. */
  @IsOptional()
  @IsString()
  from?: string;

  /** ISO date string — inclusive upper bound for createdAt. */
  @IsOptional()
  @IsString()
  to?: string;

  /** Stories: true = expired, false = still active. */
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  expired?: string;
}
