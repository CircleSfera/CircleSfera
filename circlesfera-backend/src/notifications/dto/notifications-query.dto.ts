import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

// The groups the activity page filters by, as Instagram's: everything,
// comments (and mentions), follows, and likes.
export const NOTIFICATION_KINDS = [
  'all',
  'comments',
  'follows',
  'likes',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export class NotificationsQueryDto extends PaginationDto {
  @ApiProperty({
    required: false,
    enum: NOTIFICATION_KINDS,
    default: 'all',
  })
  @IsOptional()
  @IsIn(NOTIFICATION_KINDS)
  kind?: NotificationKind = 'all';
}
