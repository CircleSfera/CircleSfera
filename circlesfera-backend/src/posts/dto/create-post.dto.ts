import { Visibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class TagDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

class MediaItemDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsOptional()
  type!: string; // 'image' | 'video'

  @IsString()
  @IsOptional()
  standardUrl?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsString()
  @IsOptional()
  filter?: string;

  @IsString()
  @IsOptional()
  altText?: string;
}

export class CreatePostDto {
  @IsString()
  @IsOptional()
  caption?: string;

  @IsOptional()
  @IsEnum(['POST', 'FRAME'])
  type?: 'POST' | 'FRAME';

  @IsString()
  @IsOptional()
  location?: string;

  @IsOptional()
  @IsBoolean()
  hideLikes?: boolean;

  @IsOptional()
  @IsBoolean()
  turnOffComments?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  @IsOptional()
  media?: MediaItemDto[];

  @IsString()
  @IsOptional()
  audioId?: string;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsEnum(['GENERAL', 'MATURE'])
  contentRating?: 'GENERAL' | 'MATURE';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagDto)
  @IsOptional()
  tags?: TagDto[];

  @IsBoolean()
  @IsOptional()
  isPremium?: boolean;

  @IsNumber()
  @IsOptional()
  priceCents?: number;

  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;
}
