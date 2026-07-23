import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UnlockStoryDto {
  @IsString()
  @IsNotEmpty()
  storyId!: string;

  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
