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
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(300)
  prompt!: string;

  @IsOptional()
  @IsUUID()
  postId?: string;

  @IsOptional()
  @IsUUID()
  storyId?: string;

  /** Where it sits on the story; only for a story. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StickerPlacementDto)
  placement?: StickerPlacementDto;
}
