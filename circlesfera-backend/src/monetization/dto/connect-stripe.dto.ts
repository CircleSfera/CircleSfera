import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConnectStripeDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  refreshUrl!: string;
}
