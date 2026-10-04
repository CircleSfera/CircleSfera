import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { MIN_TIP_CENTS } from '../../common/constants/monetization.constants.js';

export class SendTipDto {
  @IsString()
  @IsNotEmpty()
  receiverId!: string;

  @IsInt()
  @Min(MIN_TIP_CENTS, {
    message: `Minimum tip is €${(MIN_TIP_CENTS / 100).toFixed(2)}`,
  })
  amountCents!: number;

  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @IsString()
  @IsOptional()
  postId?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
