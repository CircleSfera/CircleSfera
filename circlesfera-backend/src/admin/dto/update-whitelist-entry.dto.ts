import { ApiProperty } from '@nestjs/swagger';
import { WhitelistStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateWhitelistEntryDto {
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, type: () => String, format: 'email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, enum: ['VALID', 'REGISTERED'] })
  @IsOptional()
  @IsEnum(WhitelistStatus)
  status?: WhitelistStatus;
}
