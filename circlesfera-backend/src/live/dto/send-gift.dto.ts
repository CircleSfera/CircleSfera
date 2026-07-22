import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class SendGiftDto {
  @IsString()
  @IsNotEmpty()
  giftId!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}
