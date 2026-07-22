import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  IsUUID,
  Min,
} from 'class-validator';

export class SubscribeCreatorDto {
  @IsUUID()
  @IsNotEmpty()
  creatorId!: string;

  @IsInt()
  @Min(100)
  priceCents!: number;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  returnUrl!: string;
}
