import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

// Why the active Profile is offered no instant payout now.
export const INSTANT_PAYOUT_UNAVAILABLE_REASONS = [
  // It has no payout account of its own.
  'NO_ACCOUNT',
  // It has no track record yet: too recent a first sale, too few sales, or
  // a dispute in the last 180 days.
  'TRACK_RECORD',
  // It or its person is banned or suspended, its payouts are held, or the
  // provider does not pay it out.
  'RESTRICTED',
  // A dispute of a payment its person received is open.
  'DISPUTE_OPEN',
  // Nothing can be taken out instantly now.
  'NO_BALANCE',
  // The provider offers no instant payout, or not at CircleSfera's price.
  'UNAVAILABLE',
] as const;
export type InstantPayoutUnavailableReason =
  (typeof INSTANT_PAYOUT_UNAVAILABLE_REASONS)[number];

// How far the Profile is in the track record an instant payout asks for.
export class InstantPayoutTrackRecordDto {
  @ApiProperty({ type: () => Number, example: 90 })
  minDaysSinceFirstSale!: number;

  @ApiProperty({
    type: () => Number,
    nullable: true,
    description: 'Whole days since its first sale; null before any',
  })
  daysSinceFirstSale!: number | null;

  @ApiProperty({ type: () => Number, example: 10 })
  minSales!: number;

  @ApiProperty({ type: () => Number })
  sales!: number;

  @ApiProperty({ type: () => Number, example: 180 })
  disputeFreeDays!: number;

  @ApiProperty({
    type: () => Boolean,
    description: 'Whether a payment it received was disputed in that window',
  })
  disputedRecently!: boolean;
}

// What an instant payout would bring now: the balance taken out, the fee
// and what reaches the bank. Integer cents.
export class InstantPayoutQuoteDto {
  @ApiProperty({ type: () => String, example: 'EUR' })
  currency!: string;

  @ApiProperty({ type: () => Number, description: 'Balance taken out' })
  amountCents!: number;

  @ApiProperty({ type: () => Number, description: 'Fee of the payout' })
  feeCents!: number;

  @ApiProperty({ type: () => Number, description: 'What reaches the bank' })
  netCents!: number;
}

export class InstantPayoutOfferDto {
  @ApiProperty({ type: () => Boolean })
  available!: boolean;

  @ApiProperty({
    enum: INSTANT_PAYOUT_UNAVAILABLE_REASONS,
    nullable: true,
  })
  reason!: InstantPayoutUnavailableReason | null;

  @ApiProperty({ type: () => InstantPayoutTrackRecordDto, nullable: true })
  trackRecord!: InstantPayoutTrackRecordDto | null;

  @ApiProperty({ type: () => InstantPayoutQuoteDto, nullable: true })
  quote!: InstantPayoutQuoteDto | null;
}

export class CreateInstantPayoutDto {
  @ApiProperty({
    type: () => Number,
    description:
      'What reaches the bank, as the offer showed it; refused if it changed since',
  })
  @IsInt()
  @Min(1)
  netCents!: number;

  @ApiProperty({
    type: () => String,
    description: 'One per confirmation: a repeated request pays out once',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey!: string;
}

export class InstantPayoutResultDto {
  @ApiProperty({ type: () => String })
  currency!: string;

  @ApiProperty({ type: () => Number })
  netCents!: number;

  @ApiProperty({
    type: () => String,
    nullable: true,
    description: 'When the provider expects it in the bank (ISO 8601)',
  })
  arrivalDate!: string | null;
}
