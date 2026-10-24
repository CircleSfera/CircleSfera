import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 6,
    maxLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 8)
  twoFactorAuthenticationCode!: string;
}
