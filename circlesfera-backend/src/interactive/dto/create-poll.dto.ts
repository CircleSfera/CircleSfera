import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StickerPlacementDto } from './sticker-placement.dto.js';

export class CreatePollDto {
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 1,
    maxLength: 300,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(300)
  question!: string;

  @ApiProperty({
    required: true,
    type: () => [String],
    minItems: 2,
    maxItems: 6,
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  options!: string[];

  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  postId?: string;

  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  storyId?: string;

  /** Where it sits on the story; only for a story. */
  @ApiProperty({ required: false, type: () => StickerPlacementDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StickerPlacementDto)
  placement?: StickerPlacementDto;
}
