import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn, IsNotEmpty, IsUUID } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ required: true, type: () => String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  planId!: string;

  @ApiProperty({
    required: true,
    default: 'MONTHLY',
    enum: ['MONTHLY', 'YEARLY'],
  })
  @IsIn(['MONTHLY', 'YEARLY'])
  billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY';

  // The buyer consents to start at once and acknowledges losing the right of
  // withdrawal; without it the purchase is refused.
  @ApiProperty({ required: true, type: () => Boolean })
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}
