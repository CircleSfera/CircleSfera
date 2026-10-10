import {
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SignInProofDto } from './sign-in-proof.dto.js';

/** A Profile gets its own email and password. */
export class OwnSignInDto extends SignInProofDto {
  @IsUUID()
  profileId!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
