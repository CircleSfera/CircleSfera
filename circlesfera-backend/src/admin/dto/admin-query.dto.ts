import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AdminQueryDto extends PaginationDto {
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  search?: string;

  // Filter content lists by author / host user id.
  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  // Filter reports by AdminIdentity assignee.
  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;

  // Filter the audit log by the staff member who acted.
  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({
    required: false,
    type: () => String,
    enum: ['verified', 'pending', 'not_started'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['verified', 'pending', 'not_started'])
  kycStatus?: string;

  // Support tickets: what the ticket is about.
  @ApiProperty({
    required: false,
    type: () => String,
    enum: ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'])
  category?: string;

  @ApiProperty({
    required: false,
    type: () => String,
    enum: ['POST', 'FRAME', 'STORY', 'COMMENT'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['POST', 'FRAME', 'STORY', 'COMMENT'])
  type?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  moderationStatus?: string;

  // AdminAuditLog.action filter (e.g. BAN_USER).
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  action?: string;

  // ISO date string — inclusive lower bound for createdAt.
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  from?: string;

  // ISO date string — inclusive upper bound for createdAt.
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  to?: string;

  // Stories: true = expired, false = still active.
  @ApiProperty({ required: false, type: () => String, enum: ['true', 'false'] })
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  expired?: string;
}
