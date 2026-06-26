import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UnlockPostDto {
  @IsString()
  @IsNotEmpty()
  postId!: string;

  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
