import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWhitelistEntryDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  name?: string;
}
