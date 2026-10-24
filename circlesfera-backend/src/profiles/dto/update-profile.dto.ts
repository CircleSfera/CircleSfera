import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    required: false,
    type: () => String,
    minLength: 3,
    maxLength: 30,
    pattern: '^[a-zA-Z0-9._]+$',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: 'Username can only contain letters, numbers, dots and underscores',
  })
  username?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fullName?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @ApiProperty({ required: false, type: () => String, minLength: 1 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  avatar?: string;

  @ApiProperty({
    required: false,
    type: () => String,
    nullable: true,
    format: 'uri',
  })
  @IsOptional()
  @IsUrl()
  @ValidateIf((o: UpdateProfileDto) => o.website !== null)
  website?: string | null;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  // Chosen by the user; no platform plan is required for Creator or Business.
  @ApiProperty({ required: false, enum: ['PERSONAL', 'CREATOR', 'BUSINESS'] })
  @IsOptional()
  @IsIn(['PERSONAL', 'CREATOR', 'BUSINESS'])
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';

  // Colour of the Profile page, from the closed list; null goes back to the
  // colour of the app. Choosing one needs the Elite Creator or Business plan.
  @ApiProperty({ required: false, nullable: true, enum: PROFILE_ACCENT_COLORS })
  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => o.accentColor !== null)
  @IsIn(PROFILE_ACCENT_COLORS)
  accentColor?: ProfileAccentColor | null;
}
