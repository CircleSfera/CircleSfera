import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateStoryDto {
  @IsString()
  url!: string;

  @IsString()
  @IsOptional()
  standardUrl?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsOptional()
  @IsEnum(['image', 'video'])
  mediaType?: string = 'image';

  @IsOptional()
  isCloseFriendsOnly?: boolean;

  @IsString()
  @IsOptional()
  audioId?: string;

  @IsBoolean()
  @IsOptional()
  isPremium?: boolean;

  @IsNumber()
  @IsOptional()
  priceCents?: number;
}
