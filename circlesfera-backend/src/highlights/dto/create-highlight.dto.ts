import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateHighlightDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsArray()
  @IsString({ each: true })
  storyIds!: string[];
}
