import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

export class SwitchToYearlyDto {
  // Paying by the year starts a new year of the plan at once: the payer
  // asks for it to start now and accepts paying for the part used if they
  // withdraw (TRLGDCU Art. 108), as at checkout; without it the change is
  // refused.
  @ApiProperty({ required: true, type: () => Boolean })
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}
