import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  avatarUrl?: string;
}
