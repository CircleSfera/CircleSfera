import { TIP_AMOUNTS_CENTS } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendTipDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  receiverId!: string;

  // One of the fixed amounts; any other is refused with TIP_AMOUNT_NOT_ALLOWED.
  @ApiProperty({ required: true, type: () => Number, enum: TIP_AMOUNTS_CENTS })
  @IsInt()
  amountCents!: number;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  // The post the tip is for; a tip without one is refused with
  // TIP_TARGET_REQUIRED, which apps that leave it out can read.
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsOptional()
  postId?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
