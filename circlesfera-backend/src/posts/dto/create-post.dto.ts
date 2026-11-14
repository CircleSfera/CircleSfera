import { POST_SHAPES, type PostShape } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Visibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateNested,
} from 'class-validator';
import { FRAME_COVER_MAX_TIME_MS } from '../../common/constants/media-duration.constants.js';
import { POST_MAX_MEDIA_ITEMS } from '../../common/constants/post-media.constants.js';
import { PlaceInputDto } from '../../common/dto/place-input.dto.js';

/** The longest caption of a post or frame; the composer shows the same limit. */
export const POST_CAPTION_MAX_LENGTH = 2200;

/** The longest address of an uploaded file the request may name. */
export const POST_FILE_URL_MAX_LENGTH = 2048;

/**
 * A frame's cover is a moment of its video or an image, never both: the
 * image is refused when the moment is sent with it.
 */
export function NotWithCoverTime() {
  return ValidateBy({
    name: 'notWithCoverTime',
    validator: {
      validate: (_value, args) =>
        (args?.object as { coverTimeMs?: unknown } | undefined)?.coverTimeMs ===
        undefined,
      defaultMessage: () =>
        'coverImageUrl cannot be sent together with coverTimeMs',
    },
  });
}

class TagDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  profileId!: string;

  @ApiProperty({ required: true, type: () => Number })
  @IsNumber()
  x!: number;

  @ApiProperty({ required: true, type: () => Number })
  @IsNumber()
  y!: number;
}

class MediaItemDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsOptional()
  type!: string; // 'image' | 'video'

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  standardUrl?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  filter?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  altText?: string;
}

export class CreatePostDto {
  @ApiProperty({
    required: false,
    type: () => String,
    maxLength: POST_CAPTION_MAX_LENGTH,
  })
  @IsString()
  @MaxLength(POST_CAPTION_MAX_LENGTH)
  @IsOptional()
  caption?: string;

  @ApiProperty({ required: false, enum: ['POST', 'FRAME'] })
  @IsOptional()
  @IsEnum(['POST', 'FRAME'])
  type?: 'POST' | 'FRAME';

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  placeId?: string;

  @ApiProperty({ required: false, type: () => PlaceInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlaceInputDto)
  place?: PlaceInputDto;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  hideLikes?: boolean;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  turnOffComments?: boolean;

  @ApiProperty({
    required: false,
    type: () => [MediaItemDto],
    maxItems: POST_MAX_MEDIA_ITEMS,
  })
  @IsArray()
  @ArrayMaxSize(POST_MAX_MEDIA_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  @IsOptional()
  media?: MediaItemDto[];

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  audioId?: string;

  /** Milliseconds into the track. Clip length = media duration at playback. */
  @ApiProperty({ required: false, type: () => Number, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  audioStartMs?: number;

  /**
   * The song is already mixed into the video (made in the Edits Studio): it
   * counts as a use of the song, and the video keeps its own sound.
   */
  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  audioInVideo?: boolean;

  /**
   * The Edits Studio template the post was made with, for its credit: one
   * the author may use.
   */
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiProperty({ required: false, enum: ['PUBLIC', 'FOLLOWERS', 'PRIVATE'] })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiProperty({ required: false, enum: ['GENERAL', 'MATURE'] })
  @IsOptional()
  @IsEnum(['GENERAL', 'MATURE'])
  contentRating?: 'GENERAL' | 'MATURE';

  /** The shape every item shows in; a post only, a Frame is always upright. */
  @ApiProperty({ required: false, enum: POST_SHAPES })
  @IsOptional()
  @IsIn(POST_SHAPES)
  shape?: PostShape;

  @ApiProperty({ required: false, type: () => [TagDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagDto)
  @IsOptional()
  tags?: TagDto[];

  @ApiProperty({ required: false, type: () => Date })
  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;

  // For a frame: the moment of its video to use as the cover, in
  // milliseconds. The image is taken by the server from the video itself.
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

  // For a frame: the address of an image the author uploaded, to use as the
  // cover in place of a moment of the video. Not sent with coverTimeMs.
  @ApiProperty({
    required: false,
    type: () => String,
    maxLength: POST_FILE_URL_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(POST_FILE_URL_MAX_LENGTH)
  @NotWithCoverTime()
  coverImageUrl?: string;
}
