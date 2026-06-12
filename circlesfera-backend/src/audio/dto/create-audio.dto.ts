import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateAudioDto {
  @IsString()
  title!: string;

  @IsString()
  artist!: string;

  @IsUrl()
  url!: string;

  @IsUrl()
  @IsOptional()
  thumbnailUrl?: string;

  @IsInt()
  @Min(1)
  duration!: number;
}
