import type { LoginDto as ILoginDto } from '@circlesfera/shared';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto implements ILoginDto {
  @IsString()
  @Transform(({ value }) => value?.trim().toLowerCase())
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  twoFactorCode?: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;

  @IsOptional()
  @IsString()
  visitorId?: string;
}
