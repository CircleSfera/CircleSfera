import type { RegisterDto as IRegisterDto } from '@circlesfera/shared';
import type { Locale } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '../../common/constants/locale.constants.js';

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

  // ISO date (YYYY-MM-DD). Must be 16+ (enforced in AuthService).
  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;

  @IsOptional()
  @IsString()
  visitorId?: string;

  // App language at sign-up, for the emails sent to the new account.
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;
}
