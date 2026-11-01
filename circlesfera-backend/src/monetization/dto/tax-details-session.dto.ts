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

// Where a creator's own account is based for taxes: only the city and the
// country are given to the app.
export class TaxHeadOfficeDto {
  @ApiProperty({ type: () => String, nullable: true, example: 'Madrid' })
  city!: string | null;

  @ApiProperty({
    type: () => String,
    nullable: true,
    example: 'ES',
    description: 'ISO 3166-1 alpha-2 country code',
  })
  country!: string | null;
}

// What the tax details of the active Profile's own payout account hold.
export class TaxDetailsStatusDto {
  @ApiProperty({ type: () => TaxHeadOfficeDto, nullable: true })
  headOffice!: TaxHeadOfficeDto | null;

  @ApiProperty({
    enum: ['active', 'pending'],
    description:
      'Whether Stripe can work out taxes with these details (pending until a head office is set)',
  })
  status!: 'active' | 'pending';

  @ApiProperty({
    type: () => [String],
    example: ['ES'],
    description: 'Countries with an active tax registration',
  })
  registrationCountries!: string[];
}
