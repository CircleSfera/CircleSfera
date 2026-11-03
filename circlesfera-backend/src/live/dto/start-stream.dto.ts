import {
  LIVE_AUDIENCES,
  LIVE_TITLE_MAX_LENGTH,
  type LiveAudience,
} from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
