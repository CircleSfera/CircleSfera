import { COUNTRY_CODES } from '@circlesfera/shared';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  ValidateIf,
} from 'class-validator';

export enum VisibilityDto {
  PUBLIC = 'PUBLIC',
  FOLLOWERS = 'FOLLOWERS',
  PRIVATE = 'PRIVATE',
}

export enum ContentPreferenceDto {
  GENERAL = 'GENERAL',
  MATURE = 'MATURE',
}

export class UpdateSettingsDto {
  @IsEnum(VisibilityDto)
  @IsOptional()
  privacyLevel?: VisibilityDto;

  @IsEnum(ContentPreferenceDto)
  @IsOptional()
  contentPreference?: ContentPreferenceDto;

  @IsBoolean()
  @IsOptional()
  blurSensitiveContent?: boolean;

  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  // Off pauses every push of the Profile.
  @IsBoolean()
  @IsOptional()
  pushNotifications?: boolean;

  // Push by group, for the Profile the session acts as.
  @IsBoolean()
  @IsOptional()
  pushLikes?: boolean;

  // Comments and mentions.
  @IsBoolean()
  @IsOptional()
  pushComments?: boolean;

  // New followers and follow requests.
  @IsBoolean()
  @IsOptional()
  pushFollows?: boolean;

  @IsBoolean()
  @IsOptional()
  pushMessages?: boolean;

  // Live broadcasts of Profiles the person follows.
  @IsBoolean()
  @IsOptional()
  pushLive?: boolean;

  // The newsletter about CircleSfera, apart from the email notices.
  @IsBoolean()
  @IsOptional()
  newsletter?: boolean;

  @IsBoolean()
  @IsOptional()
  isOnboarded?: boolean;

  // The country the person says they are in, from the closed list; null goes
  // back to the country of the network at sign-up.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @ValidateIf((o: UpdateSettingsDto) => o.country !== null)
  @IsIn(COUNTRY_CODES)
  country?: string | null;
}
