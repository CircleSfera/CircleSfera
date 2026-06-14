import type { LoginDto as ILoginDto } from '@circlesfera/shared';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto implements ILoginDto {
  @IsString()
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  twoFactorCode?: string;
}
