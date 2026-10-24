import { ApiProperty } from '@nestjs/swagger';
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
import { CreateStoryStickerDto } from '../../story-stickers/dto/story-sticker.dto.js';
import { STICKER_LIMITS } from '../../story-stickers/story-sticker-settings.js';

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

export class CreateStoryDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  url!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  standardUrl?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @ApiProperty({ required: false, type: () => String, default: 'image' })
  @IsOptional()
  @IsEnum(['image', 'video'])
  mediaType?: string = 'image';

  /** The painted layer of a video story, joined to its video by the server. */
  @ApiProperty({ required: false, type: () => String, maxLength: 512 })
  @IsString()
  @IsOptional()
  @MaxLength(512)
  overlayUrl?: string;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  isCloseFriendsOnly?: boolean;

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

  /** The stickers of the story: polls, questions, quizzes and more. */
  @ApiProperty({
    required: false,
    type: () => [CreateStoryStickerDto],
    maxItems: STICKER_LIMITS.perStory,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(STICKER_LIMITS.perStory)
  @ValidateNested({ each: true })
  @Type(() => CreateStoryStickerDto)
  stickers?: CreateStoryStickerDto[];
}
