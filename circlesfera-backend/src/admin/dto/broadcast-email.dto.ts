import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

// Who a broadcast is for, among the accounts that take e-mail: one language,
// and with or without a plan. Nothing chosen is everyone.
export class BroadcastAudienceDto {
  @IsOptional()
  @IsIn(['en', 'es'])
  locale?: 'en' | 'es';

  @IsOptional()
  @IsIn(['paying', 'free'])
  plan?: 'paying' | 'free';
}

// Data transfer object for sending mass emails to all users.
export class BroadcastEmailDto extends BroadcastAudienceDto {
  // The subject line of the email.
  @IsString()
  @IsNotEmpty()
  subject!: string;

  // The main title heading inside the email body.
  @IsString()
  @IsNotEmpty()
  title!: string;

  // The main content body text (HTML supported).
  @IsString()
  @IsNotEmpty()
  content!: string;

  // Optional label for the call-to-action button.
  @IsString()
  @IsOptional()
  buttonText?: string;

  // Optional URL for the call-to-action button.
  @IsUrl()
  @IsOptional()
  buttonUrl?: string;
}
