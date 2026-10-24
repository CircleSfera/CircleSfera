import { COUNTRY_CODES } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ required: false, enum: VisibilityDto })
  @IsEnum(VisibilityDto)
  @IsOptional()
  privacyLevel?: VisibilityDto;

  @ApiProperty({ required: false, enum: ContentPreferenceDto })
  @IsEnum(ContentPreferenceDto)
  @IsOptional()
  contentPreference?: ContentPreferenceDto;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  blurSensitiveContent?: boolean;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  // Off pauses every push of the Profile.
  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  pushNotifications?: boolean;

  // Push by group, for the Profile the session acts as.
  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  pushLikes?: boolean;

  // Comments and mentions.
  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  pushComments?: boolean;

  // New followers and follow requests.
  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  pushFollows?: boolean;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  pushMessages?: boolean;

  // Live broadcasts of Profiles the person follows.
  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  pushLive?: boolean;

  // The newsletter about CircleSfera, apart from the email notices.
  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  newsletter?: boolean;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  isOnboarded?: boolean;

  // The country the person says they are in, from the closed list; null goes
  // back to the country of the network at sign-up.
  @ApiProperty({
    required: false,
    type: () => String,
    nullable: true,
    enum: COUNTRY_CODES,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @ValidateIf((o: UpdateSettingsDto) => o.country !== null)
  @IsIn(COUNTRY_CODES)
  country?: string | null;
}
