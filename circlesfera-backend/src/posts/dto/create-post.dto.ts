import { Visibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

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
}

export class CreatePostDto {
  @IsString()
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
