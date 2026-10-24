import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  verificationLevel?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  accountType?: string;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
