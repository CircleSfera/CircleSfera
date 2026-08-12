import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}

export class AdminMfaVerifyDto {
  @ApiProperty({ description: 'Short-lived MFA challenge token from login' })
  @IsString()
  mfaToken!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  code!: string;
}

export class AdminMfaSetupVerifyDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  code!: string;
}

export class AdminStepUpDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  totpCode?: string;
}
