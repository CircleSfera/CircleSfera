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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FRAME_COVER_MAX_TIME_MS } from '../../common/constants/media-duration.constants.js';
import { POST_MAX_MEDIA_ITEMS } from '../../common/constants/post-media.constants.js';

/** The longest caption of a post or frame; the composer shows the same limit. */
export const POST_CAPTION_MAX_LENGTH = 2200;

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

class PlaceTranslationDto {
  @ApiProperty({ required: true, enum: ['en', 'es'] })
  @IsIn(['en', 'es'])
  locale!: 'en' | 'es';

  @ApiProperty({ required: true, type: () => String, maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 300 })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  fullName?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 120 })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  country?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 120 })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  region?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 120 })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  locality?: string;
}

class PlaceInputDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  mapboxId!: string;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiProperty({ required: true, type: () => Number })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ required: true, type: () => Number })
  @IsNumber()
  longitude!: number;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  locality?: string;

  // The same names per language, as the map provider gave them.
  @ApiProperty({
    required: false,
    type: () => [PlaceTranslationDto],
    maxItems: 2,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => PlaceTranslationDto)
  translations?: PlaceTranslationDto[];
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

  @ApiProperty({ required: false, enum: ['PUBLIC', 'FOLLOWERS', 'PRIVATE'] })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiProperty({ required: false, enum: ['GENERAL', 'MATURE'] })
  @IsOptional()
  @IsEnum(['GENERAL', 'MATURE'])
  contentRating?: 'GENERAL' | 'MATURE';

  @ApiProperty({ required: false, type: () => [TagDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagDto)
  @IsOptional()
  tags?: TagDto[];

  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  isPremium?: boolean;

  @ApiProperty({ required: false, type: () => Number })
  @IsNumber()
  @IsOptional()
  priceCents?: number;

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
}
