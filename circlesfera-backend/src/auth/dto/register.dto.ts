import type { RegisterDto as IRegisterDto } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import type { Locale } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '../../common/constants/locale.constants.js';

export class RegisterDto implements IRegisterDto {
  @ApiProperty({ required: true, type: () => String, format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: true, type: () => String, minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  // The same rule as creating or renaming a Profile.
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 3,
    maxLength: 30,
    pattern: '^[a-zA-Z0-9._]+$',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: 'Username can only contain letters, numbers, dots and underscores',
  })
  username!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  fullName?: string;

  // ISO date (YYYY-MM-DD). Must be 16+ (enforced in AuthService).
  @ApiProperty({ required: true, type: () => String })
  @IsDateString()
  dateOfBirth!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  captchaToken?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  visitorId?: string;

  // App language at sign-up, for the emails sent to the new account.
  @ApiProperty({ required: false, enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;

  // False when the person says no to the newsletter at sign-up.
  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  newsletter?: boolean;
}
