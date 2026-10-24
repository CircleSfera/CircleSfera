import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StickerPlacementDto } from './sticker-placement.dto.js';

export class CreateQnaBoxDto {
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
  prompt!: string;

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
