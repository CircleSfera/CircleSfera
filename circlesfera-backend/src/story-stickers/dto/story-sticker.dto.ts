import { StoryStickerKind } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { STICKER_LIMITS } from '../story-sticker-settings.js';

/**
 * A sticker sent with a new story: its kind, what it holds and where it
 * sits. The ranges of the place match the story editor.
 */
export class CreateStoryStickerDto {
  @IsEnum(StoryStickerKind)
  kind!: StoryStickerKind;

  /** Checked for its kind by the service. */
  @IsObject()
  settings!: Record<string, unknown>;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-0.5)
  @Max(0.5)
  x!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-0.5)
  @Max(0.5)
  y!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.1)
  @Max(8)
  scale!: number;

  /** Degrees. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  rotation!: number;
}

/** What a viewer gives a sticker: an option, a slider value or an answer. */
export class RespondStoryStickerDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(STICKER_LIMITS.maxOptions - 1)
  optionIndex?: number;

  /** A slider, from 0 to 1. */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(STICKER_LIMITS.answerMax)
  text?: string;
}
