import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  /** Optional when refresh token is sent via http-only cookie. */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
