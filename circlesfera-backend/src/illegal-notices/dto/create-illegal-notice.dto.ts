import { ApiProperty } from '@nestjs/swagger';
import type { Locale } from '@prisma/client';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '../../common/constants/locale.constants.js';

// What DSA Art. 16(2) asks of a notice: where the content is, why it is
// illegal, who notifies (not for child sexual abuse material) and a statement
// of good faith.
export class CreateIllegalNoticeDto {
  @ApiProperty({
    required: true,
    type: () => String,
    maxLength: 2048,
    format: 'uri',
  })
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(2048)
  contentUrl!: string;

  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 20,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  explanation!: string;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  childAbuse?: boolean;

  @ApiProperty({
    required: false,
    type: () => String,
    minLength: 2,
    maxLength: 200,
  })
  @ValidateIf((dto: CreateIllegalNoticeDto) => !dto.childAbuse)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  notifierName?: string;

  @ApiProperty({
    required: false,
    type: () => String,
    maxLength: 320,
    format: 'email',
  })
  @ValidateIf((dto: CreateIllegalNoticeDto) => !dto.childAbuse)
  @IsEmail()
  @MaxLength(320)
  notifierEmail?: string;

  @ApiProperty({ required: true, type: () => Boolean })
  @Equals(true, { message: 'goodFaith must be true' })
  goodFaith!: true;

  @ApiProperty({ required: false, enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
