import { ApiProperty } from '@nestjs/swagger';
import { StoryStickerKind } from '@prisma/client';
import {
  IsBoolean,
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
  @ApiProperty({
    required: true,
    enum: [
      'MENTION',
      'POLL',
      'QUESTION',
      'QUIZ',
      'SLIDER',
      'LOCATION',
      'HASHTAG',
      'COUNTDOWN',
      'LINK',
      'MUSIC',
      'POST',
    ],
  })
  @IsEnum(StoryStickerKind)
  kind!: StoryStickerKind;

  /** Checked for its kind by the service. */
  @ApiProperty({ required: true, type: Object, additionalProperties: true })
  @IsObject()
  settings!: Record<string, unknown>;

  @ApiProperty({
    required: true,
    type: () => Number,
    minimum: -0.5,
    maximum: 0.5,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-0.5)
  @Max(0.5)
  x!: number;

  @ApiProperty({
    required: true,
    type: () => Number,
    minimum: -0.5,
    maximum: 0.5,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-0.5)
  @Max(0.5)
  y!: number;

  @ApiProperty({ required: true, type: () => Number, minimum: 0.1, maximum: 8 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.1)
  @Max(8)
  scale!: number;

  /** Degrees. */
  @ApiProperty({
    required: true,
    type: () => Number,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  rotation!: number;
}

/** What a viewer gives a sticker: an option, a slider value or an answer. */
export class RespondStoryStickerDto {
  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: 0,
    maximum: STICKER_LIMITS.maxOptions - 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(STICKER_LIMITS.maxOptions - 1)
  optionIndex?: number;

  /** A slider, from 0 to 1. */
  @ApiProperty({ required: false, type: () => Number, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  value?: number;

  @ApiProperty({
    required: false,
    type: () => String,
    maxLength: STICKER_LIMITS.answerMax,
  })
  @IsOptional()
  @IsString()
  @MaxLength(STICKER_LIMITS.answerMax)
  text?: string;

  /** A countdown: whether to be told when it ends. */
  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  remind?: boolean;
}
