import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// Staff approve a promotion or reject it; a rejection always says why, as
// the advertiser is told the reason and may appeal it. A note sent with an
// approval is checked too.
export class ReviewPromotionDto {
  @IsIn(['ACTIVE', 'REJECTED'])
  status!: 'ACTIVE' | 'REJECTED';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf(
    (o: ReviewPromotionDto) => o.status === 'REJECTED' || o.note !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
