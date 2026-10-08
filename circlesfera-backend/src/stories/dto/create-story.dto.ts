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

export class CreateStoryDto {
  @IsString()
  url!: string;

  @IsString()
  @IsOptional()
  standardUrl?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsOptional()
  @IsEnum(['image', 'video'])
  mediaType?: string = 'image';

  @IsOptional()
  @IsBoolean()
  isCloseFriendsOnly?: boolean;

  @IsString()
  @IsOptional()
  audioId?: string;

  /** Milliseconds into the track. Clip length = media duration at playback. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  audioStartMs?: number;

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
