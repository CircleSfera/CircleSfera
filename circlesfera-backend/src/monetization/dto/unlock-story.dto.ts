import { Equals, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UnlockStoryDto {
  @IsString()
  @IsNotEmpty()
  storyId!: string;

  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  // The buyer consents to start at once and acknowledges losing the right of
  // withdrawal; without it the purchase is refused.
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}
