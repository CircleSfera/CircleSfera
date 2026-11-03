import {
  LIVE_AUDIENCES,
  LIVE_TITLE_MAX_LENGTH,
  type LiveAudience,
} from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, Length } from 'class-validator';

// A live the host means to start later. Whether the time and the audience
// are allowed is decided by the service, which answers each with its code.
export class ScheduleLiveDto {
  @ApiProperty({
    type: () => String,
    minLength: 1,
    maxLength: LIVE_TITLE_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, LIVE_TITLE_MAX_LENGTH)
  title!: string;

  /** Who the live is for; everyone when left out. Never a practice. */
  @ApiProperty({ required: false, enum: LIVE_AUDIENCES })
  @IsOptional()
  @IsIn(LIVE_AUDIENCES)
  audience?: LiveAudience;

  /** When the live starts, as an ISO 8601 date and time. */
  @ApiProperty({ type: () => String, format: 'date-time' })
  @IsISO8601({ strict: true })
  startsAt!: string;
}
