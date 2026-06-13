import type { RegisterDto as IRegisterDto } from '@circlesfera/shared';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto implements IRegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  inviteCode?: string;
}
