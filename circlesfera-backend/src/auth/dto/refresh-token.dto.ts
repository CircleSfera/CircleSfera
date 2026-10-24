import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  // Optional when refresh token is sent via http-only cookie.
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
