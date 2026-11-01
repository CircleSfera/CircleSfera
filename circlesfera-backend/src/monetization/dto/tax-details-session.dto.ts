import { ApiProperty } from '@nestjs/swagger';

// What the app loads the provider's tax panels with, for the active
// Profile's own payout account.
export class TaxDetailsSessionDto {
  @ApiProperty({
    type: () => String,
    description:
      "The secret of the session of the provider's embedded panels; short-lived, never stored",
  })
  clientSecret!: string;

  @ApiProperty({
    type: () => String,
    description: "The provider's publishable key the panels load with",
  })
  publishableKey!: string;
}
