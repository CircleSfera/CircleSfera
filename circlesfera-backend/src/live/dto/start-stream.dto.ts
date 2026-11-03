import {
  LIVE_AUDIENCES,
  LIVE_TITLE_MAX_LENGTH,
  type LiveAudience,
} from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StartStreamDto {
  @ApiProperty({
    required: false,
    type: () => String,
    maxLength: LIVE_TITLE_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(LIVE_TITLE_MAX_LENGTH)
  title?: string;

  /** Who the live is for; everyone when left out. */
  @ApiProperty({ required: false, enum: LIVE_AUDIENCES })
  @IsOptional()
  @IsIn(LIVE_AUDIENCES)
  audience?: LiveAudience;

  /**
   * The host's own scheduled live to go live from: its title and audience
   * are used, in place of those given here.
   */
  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  scheduledLiveId?: string;
}
