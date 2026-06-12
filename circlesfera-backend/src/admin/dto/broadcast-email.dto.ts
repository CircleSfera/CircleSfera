import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Data transfer object for sending mass emails to all users.
 */
export class BroadcastEmailDto {
  /** The subject line of the email. */
  @IsString()
  @IsNotEmpty()
  subject!: string;

  /** The main title heading inside the email body. */
  @IsString()
  @IsNotEmpty()
  title!: string;

  /** The main content body text (HTML supported). */
  @IsString()
  @IsNotEmpty()
  content!: string;

  /** Optional label for the call-to-action button. */
  @IsString()
  @IsOptional()
  buttonText?: string;

  /** Optional URL for the call-to-action button. */
  @IsUrl()
  @IsOptional()
  buttonUrl?: string;
}
