import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    required: false,
    type: () => String,
    minLength: 1,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword?: string;

  // The answer of the authenticator to the step-up challenge.
  @ApiProperty({ required: false, type: Object, additionalProperties: true })
  @IsOptional()
  @IsObject()
  passkeyAssertion?: Record<string, unknown>;
}
