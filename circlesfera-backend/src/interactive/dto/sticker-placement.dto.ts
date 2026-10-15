import { IsNumber, Max, Min } from 'class-validator';

/**
 * Where a poll or a question sits on a story, so viewers answer it there.
 * The centre is a share of the story's width and height from its middle.
 * Keep the ranges in line with the story composer.
 */
export class StickerPlacementDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-0.5)
  @Max(0.5)
  x!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-0.5)
  @Max(0.5)
  y!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.5)
  @Max(1.35)
  scale!: number;

  /** Degrees. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  rotation!: number;
}
