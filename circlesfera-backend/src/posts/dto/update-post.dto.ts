import { Visibility } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { POST_CAPTION_MAX_LENGTH } from './create-post.dto.js';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(POST_CAPTION_MAX_LENGTH)
  caption?: string;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}
