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

  // The buyer asks for the plan to start at once and accepts paying for the
  // part already used if they withdraw within 14 days (TRLGDCU Art. 108);
  // without it the purchase is refused. The name is kept from the earlier
  // wording so the API does not change.
  @ApiProperty({ required: true, type: () => Boolean })
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}
