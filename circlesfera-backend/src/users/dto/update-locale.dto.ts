import type { Locale } from '@prisma/client';
import { IsIn } from 'class-validator';
import { SUPPORTED_LOCALES } from '../../common/constants/locale.constants.js';

export class UpdateLocaleDto {
  @IsIn(SUPPORTED_LOCALES)
  locale!: Locale;
}
