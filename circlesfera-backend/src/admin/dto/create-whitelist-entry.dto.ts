import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminCreateWhitelistEntryDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export { AdminCreateWhitelistEntryDto as CreateWhitelistEntryDto };
