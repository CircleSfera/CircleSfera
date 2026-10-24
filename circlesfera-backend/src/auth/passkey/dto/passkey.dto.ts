import { ApiProperty } from '@nestjs/swagger';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class RegisterPasskeyDto {
  @ApiProperty({ required: true, type: () => Object })
  @IsNotEmpty()
  @IsObject()
  registrationResponse!: RegistrationResponseJSON;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  label?: string;
}

export class GetPasskeyOptionsDto {
  @ApiProperty({ required: true, type: () => String })
  @IsNotEmpty()
  @IsString()
  email!: string;

  @ApiProperty({ required: false, enum: ['standard', 'sensitive'] })
  @IsOptional()
  @IsString()
  sensitivity?: 'standard' | 'sensitive';
}

// Body of DELETE /auth/passkey/:id: a fresh passkey assertion (step-up).
export class DeletePasskeyDto {
  @ApiProperty({ required: true, type: () => Object })
  @IsNotEmpty()
  @IsObject()
  authenticationResponse!: AuthenticationResponseJSON;
}

export class AuthenticatePasskeyDto {
  @ApiProperty({ required: true, type: () => String })
  @IsNotEmpty()
  @IsString()
  email!: string;

  @ApiProperty({ required: true, type: () => Object })
  @IsNotEmpty()
  @IsObject()
  authenticationResponse!: AuthenticationResponseJSON;
}
