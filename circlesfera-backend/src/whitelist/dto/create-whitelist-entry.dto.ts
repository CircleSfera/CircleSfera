import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWhitelistEntryDto {
  @ApiProperty({ required: true, type: () => String, format: 'email' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  name?: string;
}
