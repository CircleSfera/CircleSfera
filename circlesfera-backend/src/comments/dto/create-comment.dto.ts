import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  parentId?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  url?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  mediaType?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  voiceUrl?: string;

  @ApiProperty({ required: false, type: () => Number })
  @IsOptional()
  voiceDuration?: number;

  @ApiProperty({ required: false, type: () => [Number] })
  @IsOptional()
  voiceWaveform?: number[];
}
