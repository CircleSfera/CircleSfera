import { ApiProperty } from '@nestjs/swagger';
import { Visibility } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FRAME_COVER_MAX_TIME_MS } from '../../common/constants/media-duration.constants.js';
import { POST_CAPTION_MAX_LENGTH } from './create-post.dto.js';

export class UpdatePostDto {
  @ApiProperty({
    required: false,
    type: () => String,
    maxLength: POST_CAPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(POST_CAPTION_MAX_LENGTH)
  caption?: string;

  @ApiProperty({ required: false, enum: ['PUBLIC', 'FOLLOWERS', 'PRIVATE'] })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  // For a frame: the moment of its video to use as the cover, in
  // milliseconds. The video itself cannot be changed.
  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: 0,
    maximum: FRAME_COVER_MAX_TIME_MS,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(FRAME_COVER_MAX_TIME_MS)
  coverTimeMs?: number;
}
