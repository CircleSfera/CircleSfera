import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class RegisterPasskeyDto {
  @IsNotEmpty()
  @IsObject()
  registrationResponse!: RegistrationResponseJSON;

  @IsOptional()
  @IsString()
  label?: string;
}

export class GetPasskeyOptionsDto {
  @IsNotEmpty()
  @IsString()
  email!: string;
}

export class AuthenticatePasskeyDto {
  @IsNotEmpty()
  @IsString()
  email!: string;

  @IsNotEmpty()
  @IsObject()
  authenticationResponse!: AuthenticationResponseJSON;
}
