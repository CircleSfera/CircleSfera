import { IsNotEmpty, IsString } from 'class-validator';

export class ConnectStripeDto {
  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @IsString()
  @IsNotEmpty()
  refreshUrl!: string;
}
