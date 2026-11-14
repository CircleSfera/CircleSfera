import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { EMAIL_CODE_DIGITS } from '../company-verification.constants.js';

// The part of an address before the @ on the application's domain.
export class SendEmailCodeDto {
  @ApiProperty({ required: true, maxLength: 64 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  localPart!: string;
}

// The code sent to that address.
export class ConfirmEmailCodeDto {
  @ApiProperty({ required: true, pattern: `^\\d{${EMAIL_CODE_DIGITS}}$` })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(new RegExp(`^\\d{${EMAIL_CODE_DIGITS}}$`))
  code!: string;
}
