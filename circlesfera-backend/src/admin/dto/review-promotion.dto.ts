import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// Staff approve a promotion or reject it; a rejection always says why, as
// the advertiser is told the reason and may appeal it.
export class ReviewPromotionDto {
  @IsIn(['ACTIVE', 'REJECTED'])
  status!: 'ACTIVE' | 'REJECTED';

  @ValidateIf((o: ReviewPromotionDto) => o.status === 'REJECTED')
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
