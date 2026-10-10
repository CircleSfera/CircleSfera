import { IsUUID } from 'class-validator';
import { SignInProofDto } from './sign-in-proof.dto.js';

/** A Profile goes back to a sign-in it shares with others. */
export class ShareSignInDto extends SignInProofDto {
  @IsUUID()
  profileId!: string;

  // The sign-in of the same person the Profile will use.
  @IsUUID()
  signInId!: string;
}
