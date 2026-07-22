import { IsNotEmpty, IsString, Length } from 'class-validator';

export class TwoFactorCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 8)
  twoFactorAuthenticationCode!: string;
}
