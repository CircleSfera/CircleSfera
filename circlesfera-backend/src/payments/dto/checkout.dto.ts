import { Equals, IsIn, IsNotEmpty, IsUUID } from 'class-validator';

export class CheckoutDto {
  @IsUUID()
  @IsNotEmpty()
  planId!: string;

  @IsIn(['MONTHLY', 'YEARLY'])
  billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY';

  // The buyer consents to start at once and acknowledges losing the right of
  // withdrawal; without it the purchase is refused.
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}
