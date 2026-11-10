import {
  BUSINESS_CATEGORIES,
  BUSINESS_CONTACT_EMAIL_MAX,
  BUSINESS_CONTACT_PHONE_PATTERN,
  type BusinessCategory,
} from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  PROFILE_ACCENT_COLORS,
  type ProfileAccentColor,
} from '../../common/constants/profile-personalization.constants.js';
import { PlaceInputDto } from '../../common/dto/place-input.dto.js';

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

  // How a Business Profile presents itself. Each is optional; null removes
  // it. Only a Business Profile can set one (the service checks).
  @ApiProperty({ required: false, nullable: true, enum: BUSINESS_CATEGORIES })
  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => o.businessCategory !== null)
  @IsIn(BUSINESS_CATEGORIES)
  businessCategory?: BusinessCategory | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: () => String,
    format: 'email',
    maxLength: BUSINESS_CONTACT_EMAIL_MAX,
  })
  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => o.contactEmail !== null)
  @IsString()
  @MaxLength(BUSINESS_CONTACT_EMAIL_MAX)
  @IsEmail()
  contactEmail?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: () => String,
    pattern: BUSINESS_CONTACT_PHONE_PATTERN.source,
  })
  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => o.contactPhone !== null)
  @IsString()
  @Matches(BUSINESS_CONTACT_PHONE_PATTERN, {
    message: 'contactPhone must be a + followed by 8 to 15 digits',
  })
  contactPhone?: string | null;

  // The business's address, chosen with the place search; null removes it.
  @ApiProperty({ required: false, nullable: true, type: () => PlaceInputDto })
  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => o.businessPlace !== null)
  @ValidateNested()
  @Type(() => PlaceInputDto)
  businessPlace?: PlaceInputDto | null;
}
