import { FRAME_LOOK_RANGES } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { FRAME_CLIPS_MAX } from '../../common/constants/media-duration.constants.js';

/** One recorded clip of a Frame and the part of it that is kept. */
export class FrameClipDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiProperty({ required: true, type: () => Number, minimum: 0 })
  @IsInt()
  @Min(0)
  startMs!: number;

  @ApiProperty({ required: true, type: () => Number, minimum: 1 })
  @IsInt()
  @Min(1)
  endMs!: number;
}

/**
 * The look of a Frame: whole numbers within FRAME_LOOK_RANGES. The server
 * writes the filters from them; no filter text is ever taken.
 */
export class FrameLookDto {
  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.brightness.min,
    maximum: FRAME_LOOK_RANGES.brightness.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.brightness.min)
  @Max(FRAME_LOOK_RANGES.brightness.max)
  brightness?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.contrast.min,
    maximum: FRAME_LOOK_RANGES.contrast.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.contrast.min)
  @Max(FRAME_LOOK_RANGES.contrast.max)
  contrast?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.saturation.min,
    maximum: FRAME_LOOK_RANGES.saturation.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.saturation.min)
  @Max(FRAME_LOOK_RANGES.saturation.max)
  saturation?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.temperature.min,
    maximum: FRAME_LOOK_RANGES.temperature.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.temperature.min)
  @Max(FRAME_LOOK_RANGES.temperature.max)
  temperature?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.sepia.min,
    maximum: FRAME_LOOK_RANGES.sepia.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.sepia.min)
  @Max(FRAME_LOOK_RANGES.sepia.max)
  sepia?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.grayscale.min,
    maximum: FRAME_LOOK_RANGES.grayscale.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.grayscale.min)
  @Max(FRAME_LOOK_RANGES.grayscale.max)
  grayscale?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.vignette.min,
    maximum: FRAME_LOOK_RANGES.vignette.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.vignette.min)
  @Max(FRAME_LOOK_RANGES.vignette.max)
  vignette?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.noise.min,
    maximum: FRAME_LOOK_RANGES.noise.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.noise.min)
  @Max(FRAME_LOOK_RANGES.noise.max)
  noise?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.hue.min,
    maximum: FRAME_LOOK_RANGES.hue.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.hue.min)
  @Max(FRAME_LOOK_RANGES.hue.max)
  hue?: number;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: FRAME_LOOK_RANGES.blur.min,
    maximum: FRAME_LOOK_RANGES.blur.max,
  })
  @IsOptional()
  @IsInt()
  @Min(FRAME_LOOK_RANGES.blur.min)
  @Max(FRAME_LOOK_RANGES.blur.max)
  blur?: number;
}

/** The clips of a Frame, in the order they are played, and what lies over them. */
export class AssembleFrameDto {
  @ApiProperty({
    required: true,
    type: () => [FrameClipDto],
    minItems: 1,
    maxItems: FRAME_CLIPS_MAX,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FRAME_CLIPS_MAX)
  @ValidateNested({ each: true })
  @Type(() => FrameClipDto)
  clips!: FrameClipDto[];

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  layerUrl?: string;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  muted?: boolean;

  @ApiProperty({ required: false, type: () => FrameLookDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FrameLookDto)
  look?: FrameLookDto;
}
