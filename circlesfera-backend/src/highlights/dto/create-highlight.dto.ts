import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateHighlightDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  title!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiProperty({ required: true, type: () => [String] })
  @IsArray()
  @IsString({ each: true })
  storyIds!: string[];
}
