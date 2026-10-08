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
import {
  PROFILE_ACCENT_COLORS,
  type ProfileAccentColor,
} from '../../common/constants/profile-personalization.constants.js';

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

  // Colour of the Profile page, from the closed list; null goes back to the
  // colour of the app. Choosing one needs the Elite Creator or Business plan.
  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => o.accentColor !== null)
  @IsIn(PROFILE_ACCENT_COLORS)
  accentColor?: ProfileAccentColor | null;
}
