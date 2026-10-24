import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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
