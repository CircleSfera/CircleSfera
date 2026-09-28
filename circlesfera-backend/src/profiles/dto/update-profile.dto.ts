import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: 'Username can only contain letters, numbers, dots and underscores',
  })
  username?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  avatar?: string;

  @IsOptional()
  @IsUrl()
  @ValidateIf((o: UpdateProfileDto) => o.website !== null)
  website?: string | null;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  // Chosen by the user; no platform plan is required for Creator or Business.
  @IsOptional()
  @IsIn(['PERSONAL', 'CREATOR', 'BUSINESS'])
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
}
