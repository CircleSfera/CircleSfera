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
}
