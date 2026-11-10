import {
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
} from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ required: true, type: () => String, format: 'email' })
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ required: true, type: () => String, minLength: 8 })
  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}

export class AdminMfaVerifyDto {
  @ApiProperty({ required: true, type: () => String })
  @ApiProperty({ description: 'Short-lived MFA challenge token from login' })
  @IsString()
  mfaToken!: string;

  @ApiProperty({ required: true, type: () => String, minLength: 6 })
  @ApiProperty()
  @IsString()
  @MinLength(6)
  code!: string;
}

// The proof beyond the password to enrol an authenticator: the token of the
// link sent to the staff email, or a code from an administrator.
export class AdminEnrolDto {
  @ApiProperty({ required: true, type: () => String })
  @ApiProperty({ description: 'Short-lived token from login' })
  @IsString()
  mfaToken!: string;

  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 8,
    maxLength: 200,
  })
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  proof!: string;
}

export class AdminMfaSetupVerifyDto {
  @ApiProperty({ required: true, type: () => String, minLength: 6 })
  @ApiProperty()
  @IsString()
  @MinLength(6)
  code!: string;
}

// A sensitive action is confirmed with the code of the authenticator only.
export class AdminStepUpDto {
  @ApiProperty({ required: true, type: () => String, minLength: 6 })
  @ApiProperty()
  @IsString()
  @MinLength(6)
  totpCode!: string;
}

// Sets up a staff identity's access from the link sent to its email, or a
// code from an administrator, with a password of its own.
export class AdminSetUpAccessDto {
  @ApiProperty({ required: true, type: () => String, format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 8,
    maxLength: 200,
    description: 'The token of the link, or a code from an administrator',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  proof!: string;

  @ApiProperty({
    required: true,
    type: () => String,
    minLength: STAFF_PASSWORD_MIN_LENGTH,
    maxLength: STAFF_PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(STAFF_PASSWORD_MIN_LENGTH)
  @MaxLength(STAFF_PASSWORD_MAX_LENGTH)
  password!: string;
}

// Changes the password of the identity signed in, or sets its own for the
// first time. A member of staff also gives a code of its authenticator.
export class AdminChangePasswordDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 200 })
  @IsString()
  @MaxLength(STAFF_PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({
    required: true,
    type: () => String,
    minLength: STAFF_PASSWORD_MIN_LENGTH,
    maxLength: STAFF_PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(STAFF_PASSWORD_MIN_LENGTH)
  @MaxLength(STAFF_PASSWORD_MAX_LENGTH)
  newPassword!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  totpCode?: string;
}
