import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

/**
 * Where a poll or a question sits on a story, so viewers answer it there.
 * The centre is a share of the story's width and height from its middle.
 * Keep the ranges in line with the story composer.
 */
export class StickerPlacementDto {
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

  @ApiProperty({
    required: true,
    type: () => Number,
    minimum: 0.5,
    maximum: 1.35,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.5)
  @Max(1.35)
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
