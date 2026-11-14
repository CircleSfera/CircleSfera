import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  LegacyNotForSaleFlag,
  LegacyNotForSalePrice,
} from '../../common/dto/legacy-not-for-sale.js';
import { PlaceInputDto } from '../../common/dto/place-input.dto.js';
import { CreateStoryStickerDto } from '../../story-stickers/dto/story-sticker.dto.js';
import { STICKER_LIMITS } from '../../story-stickers/story-sticker-settings.js';

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

  /** Sent by older app versions; accepted only as "not for sale" and never read. */
  @LegacyNotForSaleFlag()
  isPremium?: false;

  /** Sent by older app versions; accepted only as 0 and never read. */
  @LegacyNotForSalePrice()
  priceCents?: 0;
}
