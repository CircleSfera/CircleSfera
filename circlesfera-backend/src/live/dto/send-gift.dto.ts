import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class SendGiftDto {
  @IsString()
  @IsNotEmpty()
  giftId!: string;

  /** Return URL after Stripe Checkout (defaults to current origin live page). */
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  returnUrl?: string;
}
