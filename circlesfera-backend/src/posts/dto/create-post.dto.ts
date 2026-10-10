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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** The longest caption of a post or frame; the composer shows the same limit. */
export const POST_CAPTION_MAX_LENGTH = 2200;

class TagDto {
  @IsString()
  @IsNotEmpty()
  profileId!: string;

  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

class MediaItemDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsOptional()
  type!: string; // 'image' | 'video'

  @IsString()
  @IsOptional()
  standardUrl?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsString()
  @IsOptional()
  filter?: string;

  @IsString()
  @IsOptional()
  altText?: string;
}

class PlaceTranslationDto {
  @IsIn(['en', 'es'])
  locale!: 'en' | 'es';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  fullName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  country?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  region?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  locality?: string;
}

class PlaceInputDto {
  @IsString()
  @IsNotEmpty()
  mapboxId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  region?: string;

  @IsString()
  @IsOptional()
  locality?: string;

  // The same names per language, as the map provider gave them.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => PlaceTranslationDto)
  translations?: PlaceTranslationDto[];
}

export class CreatePostDto {
  @IsString()
  @MaxLength(POST_CAPTION_MAX_LENGTH)
  @IsOptional()
  caption?: string;

  @IsOptional()
  @IsEnum(['POST', 'FRAME'])
  type?: 'POST' | 'FRAME';

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  placeId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlaceInputDto)
  place?: PlaceInputDto;

  @IsOptional()
  @IsBoolean()
  hideLikes?: boolean;

  @IsOptional()
  @IsBoolean()
  turnOffComments?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  @IsOptional()
  media?: MediaItemDto[];

  @IsString()
  @IsOptional()
  audioId?: string;

  /** Milliseconds into the track. Clip length = media duration at playback. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  audioStartMs?: number;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsEnum(['GENERAL', 'MATURE'])
  contentRating?: 'GENERAL' | 'MATURE';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagDto)
  @IsOptional()
  tags?: TagDto[];

  @IsBoolean()
  @IsOptional()
  isPremium?: boolean;

  @IsNumber()
  @IsOptional()
  priceCents?: number;

  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;
}
