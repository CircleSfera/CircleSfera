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
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(2048)
  contentUrl!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  explanation!: string;

  @IsOptional()
  @IsBoolean()
  childAbuse?: boolean;

  @ValidateIf((dto: CreateIllegalNoticeDto) => !dto.childAbuse)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  notifierName?: string;

  @ValidateIf((dto: CreateIllegalNoticeDto) => !dto.childAbuse)
  @IsEmail()
  @MaxLength(320)
  notifierEmail?: string;

  @Equals(true, { message: 'goodFaith must be true' })
  goodFaith!: true;

  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}
