import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminCreateWhitelistEntryDto {
  @ApiProperty({ required: true, type: () => String, format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export { AdminCreateWhitelistEntryDto as CreateWhitelistEntryDto };
