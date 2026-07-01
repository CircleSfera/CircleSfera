import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateUserStatusDto {
  @IsOptional()
  @IsString()
  verificationLevel?: string;

  @IsOptional()
  @IsString()
  accountType?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
