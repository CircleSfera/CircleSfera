import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class SendGiftDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  giftId!: string;

  // Return URL after Stripe Checkout (defaults to current origin live page).
  @ApiProperty({ required: false, type: () => String, format: 'uri' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  returnUrl?: string;
}
