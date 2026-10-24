import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { MIN_TIP_CENTS } from '../../common/constants/monetization.constants.js';

export class SendTipDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  receiverId!: string;

  @ApiProperty({ required: true, type: () => Number, minimum: MIN_TIP_CENTS })
  @IsInt()
  @Min(MIN_TIP_CENTS, {
    message: `Minimum tip is €${(MIN_TIP_CENTS / 100).toFixed(2)}`,
  })
  amountCents!: number;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  postId?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
