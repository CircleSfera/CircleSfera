import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class SendTipDto {
  @IsString()
  @IsNotEmpty()
  receiverId!: string;

  @IsInt()
  @Min(100, { message: 'Minimum tip is $1.00 USD' })
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
