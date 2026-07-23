import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
} from 'class-validator';

export class SubscribeCreatorDto {
  @IsUUID()
  @IsNotEmpty()
  creatorId!: string;

  /** @deprecated Ignored — server uses profile.subscriptionPriceCents */
  @IsOptional()
  @IsInt()
  @Min(100)
  priceCents?: number;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  returnUrl!: string;
}

export class SetCreatorSubscriptionPriceDto {
  @IsInt()
  @Min(100)
  priceCents!: number;
}
