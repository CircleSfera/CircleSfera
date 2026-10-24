import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateAudioDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  title!: string;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  artist!: string;

  @ApiProperty({ required: true, type: () => String, format: 'uri' })
  @IsUrl()
  url!: string;

  @ApiProperty({ required: false, type: () => String, format: 'uri' })
  @IsUrl()
  @IsOptional()
  thumbnailUrl?: string;

  @ApiProperty({ required: true, type: () => Number, minimum: 1 })
  @IsInt()
  @Min(1)
  duration!: number;
}
