import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Proof that the person at the keyboard is the one who signed in: the
 * password of the sign-in of the session, or one of its passkeys with user
 * verification. One of the two is required.
 */
export class SignInProofDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword?: string;

  // The answer of the authenticator to the step-up challenge.
  @IsOptional()
  @IsObject()
  passkeyAssertion?: Record<string, unknown>;
}
