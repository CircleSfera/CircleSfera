import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

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

  @IsBoolean()
  @IsOptional()
  pushNotifications?: boolean;
}
