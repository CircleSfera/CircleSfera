import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

// Who a broadcast is for, among the accounts that take e-mail: one language,
// and with or without a plan. Nothing chosen is everyone.
export class BroadcastAudienceDto {
  @ApiProperty({ required: false, enum: ['en', 'es'] })
  @IsOptional()
  @IsIn(['en', 'es'])
  locale?: 'en' | 'es';

  @ApiProperty({ required: false, enum: ['paying', 'free'] })
  @IsOptional()
  @IsIn(['paying', 'free'])
  plan?: 'paying' | 'free';
}

// Data transfer object for sending mass emails to all users.
export class BroadcastEmailDto extends BroadcastAudienceDto {
  // The subject line of the email.
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  // The main title heading inside the email body.
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  title!: string;

  // The main content body text (HTML supported).
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  content!: string;

  // Optional label for the call-to-action button.
  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  buttonText?: string;

  // Optional URL for the call-to-action button.
  @ApiProperty({ required: false, type: () => String, format: 'uri' })
  @IsUrl()
  @IsOptional()
  buttonUrl?: string;
}
